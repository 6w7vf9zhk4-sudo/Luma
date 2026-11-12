const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function audit(db, actorId, action, targetId, details = {}) {
  const { error } = await db.from('luma_admin_audit').insert({
    actor_id: actorId,
    action,
    target_user_id: targetId || null,
    details
  });
  if (error) throw error;
}

async function fetchUsers(db) {
  const authUsers = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const batch = data?.users || [];
    authUsers.push(...batch);
    if (batch.length < 100) break;
  }

  if (!authUsers.length) return [];
  const ids = authUsers.map(user => user.id);
  const [profilesResult, controlsResult, cloudResult] = await Promise.all([
    db.from('profiles').select('id, role').in('id', ids),
    db.from('luma_user_controls').select('user_id, blocked, reason').in('user_id', ids),
    db.from('luma_data').select('user_id, updated_at').in('user_id', ids)
  ]);
  for (const result of [profilesResult, controlsResult, cloudResult]) {
    if (result.error) throw result.error;
  }

  const profiles = new Map((profilesResult.data || []).map(row => [row.id, row]));
  const controls = new Map((controlsResult.data || []).map(row => [row.user_id, row]));
  const cloud = new Map((cloudResult.data || []).map(row => [row.user_id, row]));

  return authUsers.map(user => {
    const profile = profiles.get(user.id) || {};
    const control = controls.get(user.id) || {};
    const cloudRow = cloud.get(user.id) || {};
    return {
      id: user.id,
      email: user.email || '',
      role: profile.role || 'user',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      blocked: Boolean(control.blocked),
      block_reason: control.reason || '',
      cloud_updated_at: cloudRow.updated_at || null
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return send(res, 500, { error: 'Supabase environment variables are missing' });
  }

  const token = bearerToken(req);
  if (!token) return send(res, 401, { error: 'Authentication required' });

  const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData?.user) {
      return send(res, 401, { error: 'Invalid or expired session' });
    }

    const actor = authData.user;
    const { data: profile, error: profileError } = await db
      .from('profiles').select('role').eq('id', actor.id).maybeSingle();
    if (profileError) throw profileError;

    const actorRole = profile?.role || 'user';
    const input = req.method === 'GET' ? req.query : (req.body || {});
    const action = String(input.action || '');

    if (action === 'list_announcements') {
      const { data, error } = await db.from('luma_announcements')
        .select('id, title, body, important, active, created_at, created_by')
        .eq('active', true).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return send(res, 200, { announcements: data || [] });
    }

    const isStaff = actorRole === 'admin' || actorRole === 'developer';
    if (!isStaff) return send(res, 403, { error: 'Insufficient permissions' });

    if (action === 'list_users') {
      return send(res, 200, { users: await fetchUsers(db) });
    }

    if (action === 'stats') {
      const users = await fetchUsers(db);
      const week = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      return send(res, 200, {
        total_users: users.length,
        admins: users.filter(user => user.role === 'admin').length,
        developers: users.filter(user => user.role === 'developer').length,
        blocked: users.filter(user => user.blocked).length,
        active_7d: users.filter(user => user.last_sign_in_at &&
          now - Date.parse(user.last_sign_in_at) <= week).length
      });
    }

    if (req.method !== 'POST') {
      return send(res, 405, { error: 'POST required for this action' });
    }

    if (action === 'set_role') {
      if (actorRole !== 'developer') {
        return send(res, 403, { error: 'Only the developer can change roles' });
      }
      const targetId = String(input.user_id || '');
      const nextRole = String(input.role || '');
      if (!targetId || !['user', 'admin'].includes(nextRole)) {
        return send(res, 400, { error: 'Invalid user_id or role' });
      }
      if (targetId === actor.id) return send(res, 400, { error: 'Cannot change your own role' });

      const { data: target, error: targetError } = await db
        .from('profiles').select('id, role').eq('id', targetId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return send(res, 404, { error: 'Profile not found' });
      if (target.role === 'developer') return send(res, 403, { error: 'Developer role is protected' });

      const { error } = await db.from('profiles').update({ role: nextRole }).eq('id', targetId);
      if (error) throw error;
      await audit(db, actor.id, 'set_role', targetId, { from: target.role || 'user', to: nextRole });
      return send(res, 200, { ok: true });
    }

    if (action === 'set_block') {
      const targetId = String(input.user_id || '');
      const blocked = input.blocked === true;
      const reason = String(input.reason || '').trim().slice(0, 500);
      if (!targetId) return send(res, 400, { error: 'user_id is required' });
      if (targetId === actor.id) return send(res, 400, { error: 'Cannot block your own account' });

      const { data: target, error: targetError } = await db
        .from('profiles').select('id, role').eq('id', targetId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return send(res, 404, { error: 'Profile not found' });
      if (target.role === 'developer' || (actorRole !== 'developer' && target.role === 'admin')) {
        return send(res, 403, { error: 'You cannot block this account' });
      }

      const { error: controlError } = await db.from('luma_user_controls').upsert({
        user_id: targetId,
        blocked,
        reason: blocked ? reason : '',
        updated_by: actor.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (controlError) throw controlError;

      const { error: banError } = await db.auth.admin.updateUserById(targetId, {
        ban_duration: blocked ? '876000h' : 'none'
      });
      if (banError) throw banError;

      await audit(db, actor.id, blocked ? 'block_user' : 'unblock_user', targetId, { reason });
      return send(res, 200, { ok: true });
    }

    if (action === 'create_announcement') {
      const title = String(input.title || '').trim().slice(0, 100);
      const body = String(input.body || '').trim().slice(0, 3000);
      if (!title || !body) return send(res, 400, { error: 'Title and body are required' });
      const { data, error } = await db.from('luma_announcements').insert({
        title, body, important: input.important === true, active: true, created_by: actor.id
      }).select('id, title, body, important, active, created_at').single();
      if (error) throw error;
      await audit(db, actor.id, 'create_announcement', null, { announcement_id: data.id, title });
      return send(res, 200, { announcement: data });
    }

    if (action === 'delete_announcement') {
      const id = Number(input.id);
      if (!Number.isSafeInteger(id) || id <= 0) return send(res, 400, { error: 'Invalid announcement id' });
      const { error } = await db.from('luma_announcements').delete().eq('id', id);
      if (error) throw error;
      await audit(db, actor.id, 'delete_announcement', null, { announcement_id: id });
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (error) {
    console.error('Luma admin API error:', error);
    return send(res, 500, { error: 'Server error. Check Vercel function logs.' });
  }
};
