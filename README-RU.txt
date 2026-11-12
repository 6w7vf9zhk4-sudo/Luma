LUMA ADMIN PANEL 2.0 — СЕРВЕРНЫЕ ФАЙЛЫ

Содержимое:
- api/admin.js — серверный API для Vercel.
- package.json — зависимость Supabase JS.
- vercel.json — настройки серверной функции.
- supabase/admin-panel-setup.sql — таблицы и RLS для Supabase.

ВАЖНО:
1. Это серверная часть. Она пока не подключена к существующему интерфейсу app.js.
2. SQL предполагает, что уже созданы public.profiles (id, role) и public.luma_data.
3. Перед запуском SQL проверь структуру profiles: id должен совпадать с auth.users.id, а role должен быть text или совместимым типом.
4. В Vercel добавь переменные окружения:
   SUPABASE_URL = URL проекта Supabase
   SUPABASE_SECRET_KEY = секретный ключ Supabase (только сервер, не публиковать).
   Допускается имя SUPABASE_SERVICE_ROLE_KEY вместо SUPABASE_SECRET_KEY.
5. После загрузки файлов в корень GitHub-репозитория Vercel должен выполнить новый deployment.
6. Не вставляй секретный ключ в HTML, JS фронтенда или этот чат.

API действия:
GET /api/admin?action=list_users
GET /api/admin?action=stats
GET /api/admin?action=list_announcements
POST /api/admin с JSON action: set_role, set_block, create_announcement, delete_announcement.
Все запросы должны содержать Authorization: Bearer <access_token>.

ОГРАНИЧЕНИЯ:
- Менять роли может только аккаунт с ролью developer.
- Роль developer защищена от изменения через этот API.
- Администратор не может блокировать другого администратора или разработчика.
- Блокировка дополнительно использует Supabase Auth ban.
- В текущей сборке Luma интерфейс ещё использует старые RPC list_luma_profiles/set_luma_user_role. Для полноценной работы панели следующим отдельным обновлением будет ZIP обычных файлов сайта с подключением интерфейса к этому API.
