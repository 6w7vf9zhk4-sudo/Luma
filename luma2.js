/* Luma 2.0 enhancements. Isolated module; legacy data keys remain untouched. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORE = {
    calendar: 'luma2-calendar-v1',
    focus: 'luma2-focus-v1',
    room: 'luma2-pet-room-v1'
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { notify('Не удалось сохранить данные. Проверь свободное место браузера.'); return false; }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify = (msg) => {
    const t = $('toast');
    if (t) { t.textContent = msg; t.classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => t.classList.remove('show'), 2600); }
  };
  let events = read(STORE.calendar, []);
  if (!Array.isArray(events)) events = [];
  let focusLog = read(STORE.focus, []);
  if (!Array.isArray(focusLog)) focusLog = [];
  let selectedDate = today();
  let monthCursor = new Date();
  let selectedMinutes = 25;
  let isBreak = false;
  let remaining = selectedMinutes * 60;
  let deadline = 0;
  let timer = null;
  let running = false;

  const fmtDate = (s, opts={day:'numeric',month:'long',year:'numeric'}) => {
    const [y,m,d] = s.split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', opts).format(new Date(y,m-1,d));
  };
  const fmtMinutes = (mins) => {
    const h = Math.floor(mins/60), m = mins%60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  };
  const core = () => read('luma-v2', {});
  const renderCalendar = () => {
    const grid = $('l2CalendarGrid'); if (!grid) return;
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    $('l2CalMonth').textContent = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(monthCursor);
    const first = new Date(y,m,1), offset = (first.getDay()+6)%7;
    const start = new Date(y,m,1-offset);
    const eventDates = new Set(events.map(e=>e.date));
    let out = '';
    for(let i=0;i<42;i++){
      const d = new Date(start); d.setDate(start.getDate()+i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const cls = ['l2-day',d.getMonth()!==m?'muted':'',ds===today()?'today':'',ds===selectedDate?'selected':'',eventDates.has(ds)?'has-events':''].filter(Boolean).join(' ');
      out += `<button type="button" class="${cls}" data-l2-date="${ds}" aria-label="${esc(fmtDate(ds))}">${d.getDate()}</button>`;
    }
    grid.innerHTML = out;
    $('l2SelectedDate').textContent = fmtDate(selectedDate);
    $('l2EventDate').value = selectedDate;
    renderEvents();
  };
  const renderEvents = () => {
    const list = $('l2EventList'); if (!list) return;
    const day = events.filter(e=>e.date===selectedDate).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    $('l2EventCount').textContent = String(day.length);
    list.innerHTML = day.length ? day.map(e=>`<div class="l2-event ${e.done?'done':''}">
      <input type="checkbox" data-l2-done="${esc(e.id)}" ${e.done?'checked':''} aria-label="Отметить выполненным">
      <div class="l2-event-main"><b>${esc(e.title)}</b><small>${e.time?esc(e.time)+' · ':''}${esc(e.note||'Без заметки')}</small></div>
      <div class="l2-event-actions"><button type="button" data-l2-delete="${esc(e.id)}" aria-label="Удалить событие">×</button></div>
    </div>`).join('') : '<div class="empty">На эту дату событий пока нет.</div>';
  };
  const saveEvents = () => { write(STORE.calendar, events); renderCalendar(); renderNovaBrief(); renderStats(); };
  const addEvent = (e) => {
    e.preventDefault();
    const title = $('l2EventTitle').value.trim();
    const date = $('l2EventDate').value;
    if (!title || !date) return;
    events.push({id:'e'+Date.now().toString(36),title,date,time:$('l2EventTime').value,note:$('l2EventNote').value.trim(),done:false,created:Date.now()});
    $('l2EventTitle').value=''; $('l2EventTime').value=''; $('l2EventNote').value='';
    selectedDate=date; monthCursor=new Date(Number(date.slice(0,4)),Number(date.slice(5,7))-1,1);
    saveEvents(); notify('Событие добавлено');
  };
  const renderFocus = () => {
    const mm = Math.floor(remaining/60), ss = remaining%60;
    if ($('l2Timer')) $('l2Timer').textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    if ($('l2FocusMode')) $('l2FocusMode').textContent = isBreak ? 'Время перерыва' : 'Фокус-сессия';
    const total = selectedMinutes*60;
    if ($('l2FocusProgress')) $('l2FocusProgress').style.width = `${Math.max(0,Math.min(100,(1-remaining/total)*100))}%`;
    if ($('l2FocusStart')) $('l2FocusStart').textContent = running ? 'Идёт сессия' : 'Начать';
    if ($('l2FocusPause')) { $('l2FocusPause').disabled = !running; $('l2FocusPause').textContent = 'Пауза'; }
    document.querySelectorAll('[data-l2-min]').forEach(b=>b.classList.toggle('active',Number(b.dataset.l2Min)===selectedMinutes && Boolean(b.dataset.l2Break)===isBreak));
  };
  const renderFocusHistory = () => {
    const el=$('l2FocusHistory'); if(!el)return;
    const recent=focusLog.slice(-8).reverse();
    const total=focusLog.reduce((s,x)=>s+(x.minutes||0),0);
    $('l2FocusTotal').textContent=fmtMinutes(total);
    el.innerHTML=recent.length?recent.map(x=>`<div class="l2-event"><div class="l2-event-main"><b>${esc(x.task||'Фокус-сессия')}</b><small>${fmtDate(x.date,{day:'numeric',month:'short'})} · ${fmtMinutes(x.minutes)}</small></div></div>`).join(''):'<div class="empty">Здесь появятся завершённые фокус-сессии.</div>';
  };
  const finishFocus = () => {
    running=false; clearInterval(timer); timer=null; remaining=0; renderFocus();
    if (!isBreak) {
      focusLog.push({date:today(),minutes:selectedMinutes,task:$('l2FocusTask')?.value.trim()||'',at:Date.now()});
      focusLog=focusLog.slice(-500); write(STORE.focus,focusLog); renderFocusHistory(); renderStats();
      $('l2FocusStatus').textContent='Сессия завершена. Сделай паузу или начни следующий подход.';
      notify('Фокус-сессия завершена');
    } else {
      $('l2FocusStatus').textContent='Перерыв завершён. Можно вернуться к делам.';
      notify('Перерыв завершён');
    }
  };
  const tick = () => {
    remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
    renderFocus();
    if(remaining<=0)finishFocus();
  };
  const startFocus = () => {
    if(running)return;
    if(remaining<=0)remaining=selectedMinutes*60;
    running=true; deadline=Date.now()+remaining*1000;
    $('l2FocusStatus').textContent='Таймер запущен. Можно переключаться между разделами Luma.';
    timer=setInterval(tick,250); renderFocus();
  };
  const pauseFocus = () => {
    if(!running)return;
    remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
    running=false;clearInterval(timer);timer=null;renderFocus();
    $('l2FocusStatus').textContent='Таймер на паузе.';
  };
  const resetFocus = () => {
    running=false;clearInterval(timer);timer=null;remaining=selectedMinutes*60;renderFocus();
    $('l2FocusStatus').textContent='Таймер сброшен.';
  };
  const renderStats = () => {
    const grid=$('l2StatsGrid'); if(!grid)return;
    const d=core(), todayKey=today();
    const meals=Array.isArray(d.meals)?d.meals:[];
    const reminders=Array.isArray(d.reminders)?d.reminders:[];
    const diary=Array.isArray(d.diary)?d.diary:[];
    const walks=Array.isArray(d.walks)?d.walks:[];
    const focusToday=focusLog.filter(x=>x.date===todayKey).reduce((s,x)=>s+(x.minutes||0),0);
    const doneRem=reminders.filter(x=>x.done).length;
    const cards=[
      ['🥗','Записей о еде',meals.length],
      ['⏰','Выполнено планов',doneRem],
      ['📔','Записей в дневнике',diary.length],
      ['🚶','Прогулок',walks.length],
      ['⏳','Фокус сегодня',fmtMinutes(focusToday)],
      ['🐾','Питомцев',Array.isArray(d.pets?.owned)?d.pets.owned.length:0]
    ];
    grid.innerHTML=cards.map(c=>`<div class="l2-stat"><small>${c[0]} ${c[1]}</small><b>${c[2]}</b><span>по данным устройства</span></div>`).join('');
    const now=new Date(), days=[];
    for(let i=6;i>=0;i--){const x=new Date(now);x.setDate(now.getDate()-i);const ds=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;days.push({ds,label:new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(x),mins:focusLog.filter(f=>f.date===ds).reduce((s,f)=>s+(f.minutes||0),0)});}
    const max=Math.max(25,...days.map(x=>x.mins));
    $('l2FocusBars').innerHTML=days.map(x=>`<div class="l2-bar-col"><b>${x.mins||''}</b><div class="l2-bar" style="height:${Math.max(3,x.mins/max*86)}px"></div><small>${x.label}</small></div>`).join('');
    $('l2WeekFocusTotal').textContent=fmtMinutes(days.reduce((s,x)=>s+x.mins,0));
    $('l2ActivitySummary').innerHTML=[
      ['События календаря',events.length],['Фокус-сессии',focusLog.length],['Всего времени фокуса',fmtMinutes(focusLog.reduce((s,x)=>s+(x.minutes||0),0))],
      ['Выполнено напоминаний',doneRem],['Записей дневника',diary.length]
    ].map(x=>`<div class="l2-activity-row"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
  };
  const renderNovaBrief = () => {
    const el=$('l2NovaBrief'); if(!el)return;
    const d=core(), day=events.filter(e=>e.date===today()&&!e.done).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const reminders=(Array.isArray(d.reminders)?d.reminders:[]).filter(r=>!r.done);
    const focusMins=focusLog.filter(x=>x.date===today()).reduce((s,x)=>s+(x.minutes||0),0);
    const bits=[`На сегодня запланировано событий: <b>${day.length}</b>.`,`Активных напоминаний: <b>${reminders.length}</b>.`,`Фокус сегодня: <b>${fmtMinutes(focusMins)}</b>.`];
    if(day.length)bits.push('Ближайшее событие: <b>'+esc(day[0].time?day[0].time+' · ':'')+esc(day[0].title)+'</b>.');
    else bits.push('В календаре пока нет событий на сегодня.');
    el.innerHTML=bits.join('<br>');
  };
  const renderRoom = () => {
    const room=read(STORE.room,{decor:'none',care:0});
    const root=document.querySelector('.l2-pet-room'); if(!root)return;
    root.dataset.decor=room.decor||'none';
    const d=core(), active=d.pets?.active||'sprout';
    const icons={sprout:'🌱',cat:'🐱',fox:'🦊',bunny:'🐰',dragon:'🐉',owl:'🦉',dog:'🐶'};
    $('l2RoomPet').textContent=icons[active]||'🐾';
    $('l2PetAffection').textContent=`Забота продолжается в разделе «Питомцы». Украшений выбрано: ${room.decor==='none'?0:1}.`;
  };
  const setRoom=(decor)=>{write(STORE.room,{decor,updated:Date.now()});renderRoom();};
  const init=()=>{
    $('l2CalPrev')?.addEventListener('click',()=>{monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth()-1,1);renderCalendar();});
    $('l2CalNext')?.addEventListener('click',()=>{monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth()+1,1);renderCalendar();});
    $('l2CalendarGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-l2-date]');if(!b)return;selectedDate=b.dataset.l2Date;monthCursor=new Date(+selectedDate.slice(0,4),+selectedDate.slice(5,7)-1,1);renderCalendar();});
    $('l2EventForm')?.addEventListener('submit',addEvent);
    $('l2EventList')?.addEventListener('click',e=>{const del=e.target.closest('[data-l2-delete]');if(del){events=events.filter(x=>x.id!==del.dataset.l2Delete);saveEvents();return;}});
    $('l2EventList')?.addEventListener('change',e=>{const cb=e.target.closest('[data-l2-done]');if(!cb)return;const item=events.find(x=>x.id===cb.dataset.l2Done);if(item){item.done=cb.checked;saveEvents();}});
    document.querySelectorAll('[data-l2-min]').forEach(b=>b.addEventListener('click',()=>{if(running)return;selectedMinutes=Number(b.dataset.l2Min)||25;isBreak=!!b.dataset.l2Break;remaining=selectedMinutes*60;renderFocus();}));
    $('l2FocusStart')?.addEventListener('click',startFocus);
    $('l2FocusPause')?.addEventListener('click',pauseFocus);
    $('l2FocusReset')?.addEventListener('click',resetFocus);
    $('l2NovaRefresh')?.addEventListener('click',()=>{renderNovaBrief();notify('Сводка обновлена');});
    document.querySelectorAll('[data-l2-room]').forEach(b=>b.addEventListener('click',()=>setRoom(b.dataset.l2Room)));
    renderCalendar();renderFocus();renderFocusHistory();renderStats();renderNovaBrief();renderRoom();
    const original=window.goTab;
    if(typeof original==='function'&&!original.__luma2Wrapped){
      const wrapped=function(name){const result=original.apply(this,arguments);if(name==='calendar')renderCalendar();if(name==='focus'){renderFocus();renderFocusHistory();}if(name==='stats')renderStats();if(name==='nova')renderNovaBrief();if(name==='pets')renderRoom();return result;};
      wrapped.__luma2Wrapped=true;window.goTab=wrapped;
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));renderFocus();}else if(!document.hidden&&running)tick();});
})();
