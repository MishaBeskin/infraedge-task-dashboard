# CLAUDE.md

# Stack — Task Management App

## Project overview

Build a SaaS-style Kanban task management app called "Stack" using Angular 17+.
Backend is Supabase (hosted Postgres + Auth). The Angular app talks to it
directly through `@supabase/supabase-js` — there is no custom API server. Schema
and seed data live in `supabase/*.sql`.
The app is in Hebrew and RTL by default, with an English/LTR runtime toggle.
Do NOT use any component library (no Angular Material, no PrimeNG). All UI is custom SCSS.

## Tech stack

- Angular 17, standalone components, strict TypeScript
- No NgModules anywhere
- SCSS for styling, CSS custom properties for design tokens
- Supabase (`@supabase/supabase-js`) for data + auth; no HttpClient, no API server
- Row-Level Security scopes every `tasks` query to the signed-in user
- Functional guards (not class-based)
- OnPush change detection on all components
- Angular 17 control flow syntax (@if, @for) — never *ngIf or *ngFor

## Design system

CSS custom properties to define in styles.scss:

- --brand: #E05A20
- --brand-hover: #c44d18
- --bg: #FAF8F4
- --surface: #ffffff
- --border: #e8e4dc
- --text-primary: #1a1a1a
- --text-muted: #888780
- --priority-high: #E24B4A
- --priority-medium: #E05A20
- --priority-low: #888780
- --radius: 10px

Global body: direction rtl, font system-ui, background var(--bg).

## Data models

File: src/app/models/task.model.ts

interface AppUser { id: string, name, email }   // derived from the Supabase session; no password/token client-side
interface Task { id: string, title, status: 'todo'|'in-progress'|'done', priority: 'high'|'medium'|'low', description?, position, createdAt, updatedAt }
type NewTask = Pick<Task,'title'|'status'|'priority'> & { description? }
type TaskPatch = Partial<Pick<Task,'title'|'description'|'status'|'priority'|'position'>>
type Priority = Task['priority']
type Status = Task['status']

## Data access (Supabase)

All access goes through `SupabaseService` (owns the single `SupabaseClient`).

- Auth: `supabase.auth` — password, magic link, Google OAuth. Session persisted
  by the client, restored on load, refreshed automatically.
- `tasks` table: `supabase.from('tasks').select/insert/update/delete`. RLS scopes
  rows to `auth.uid()`, so the client never sends a user id. `user_id` defaults
  to `auth.uid()` in the DB.
- DB columns are snake_case (`user_id`, `created_at`, `position`); TaskService
  maps rows to the camelCase `Task` interface.
- Schema: `supabase/migrations/0001_init.sql`. Seed users + tasks:
  `supabase/seed.sql` (fallback `scripts/create-users.mjs`).

## File structure to create

src/app/
models/
task.model.ts
services/
auth.service.ts
task.service.ts
guards/
auth.guard.ts
interceptors/
auth.interceptor.ts
pages/
login/
login.component.ts
login.component.html
login.component.scss
board/
board.component.ts
board.component.html
board.component.scss
components/
header/
header.component.ts
header.component.html
header.component.scss
kanban-column/
kanban-column.component.ts
kanban-column.component.html
kanban-column.component.scss
task-card/
task-card.component.ts
task-card.component.html
task-card.component.scss
new-task-dialog/
new-task-dialog.component.ts
new-task-dialog.component.html
new-task-dialog.component.scss

## AuthService (src/app/services/auth.service.ts)

- Injectable providedIn root; wraps `supabase.auth`
- `currentUser$` BehaviorSubject<AppUser|null>, fed by `onAuthStateChange`
- `whenReady()` resolves once the initial `getSession()` completes (awaited by
  the guard and an APP_INITIALIZER so a hard refresh doesn't bounce to /login)
- Methods: signInWithPassword, signUp, signInWithMagicLink, signInWithGoogle,
  sendPasswordReset, updatePassword, signOut, isLoggedIn, getCurrentUser
- No interceptor: the Supabase client attaches its own auth headers

## Auth guard (src/app/guards/auth.guard.ts)

- Functional CanActivateFn named authGuard, async
- `await authService.whenReady()`, then true if `isLoggedIn()`, else
  `router.createUrlTree(['/login'])`

## App routes (src/app/app.routes.ts)

- /login → LoginComponent (lazy loaded)
- /register → RegisterComponent (lazy loaded)
- /auth/callback → AuthCallbackComponent (OAuth / magic-link redirect target)
- /reset-password → ResetPasswordComponent (password-recovery target)
- /board → BoardComponent (lazy loaded, canActivate: authGuard)
- '' → redirect to /board
- \*\* → redirect to /board

## App config (src/app/app.config.ts)

- provideRouter(routes)
- provideAppInitializer(() => inject(AuthService).whenReady())

## App component (src/app/app.component.ts)

- Just a router outlet, nothing else

## TaskService (src/app/services/task.service.ts)

- Injectable providedIn root
- BehaviorSubject<Task[]> tasks$ (private, expose as asObservable)
- BehaviorSubject<boolean> loading$
- BehaviorSubject<string|null> error$
- loadTasks(): select('*').order('position'); updates tasks$, loading$, error$ (no userId — RLS scopes it)
- createTask(NewTask): insert (position = max+1), appends to tasks$
- updateTask(id, TaskPatch): optimistic update + cancels any in-flight PATCH for the same id, then update().eq('id',id)
- deleteTask(id): delete().eq('id',id), removes from tasks$

## LoginComponent

Two-column layout (50/50 split), RTL.

RIGHT panel (branding):

- Logo "● stack" top-left
- Hebrew headline: "תכנן את העבודה. ואז בצע אותה." (large, bold, "בצע" in orange italic)
- Subtitle in Hebrew about the app
- Footer: © Stack 2026 · פרטיות · תנאים

LEFT panel (form):

- Title: "ברוך שובך"
- Subtitle: "התחבר למרחב העבודה שלך."
- Email field (label: דוא"ל), text input LTR direction
- Password field (label: סיסמה) with show/hide toggle eye button
- Submit button "→ התחברות" full width, orange
- Error message in red: "פרטי ההתחברות שגויים"
- Loading state: button disabled with text "מתחבר..."

Behavior: ReactiveFormsModule, on submit call AuthService.login(), on success navigate to /board.

## HeaderComponent

Inputs: taskCount: number
Outputs: addTask: EventEmitter<void>

RTL horizontal bar, white background, 64px height.

- Right side: orange avatar circle with user initials, orange "משימה חדשה +" button
- Center: "[N] משימות" in muted color
- Left side: "● stack" logo, logout arrow button that calls AuthService.logout() then navigates to /login

## KanbanColumnComponent

Inputs: title: string, tasks: Task[], status: Status
Outputs: addTask: EventEmitter<Status>

White card column, rounded corners, max-height with overflow-y scroll.

- Header: column title right-aligned, count badge circle, + button left-aligned
- List of TaskCardComponent
- Empty state: dashed border placeholder "אין משימות"
- - button emits addTask with the column's status

## TaskCardComponent

Input: task: Task

White card with colored right border by priority (high=red, medium=orange, low=gray).

- Task title
- Priority badge pill (גבוהה/בינונית/נמוכה) colored by priority
- Native <select> for status change (לעשות/בתהליך/הושלם) — on change calls TaskService.updateTask()
- Trash button — first click shows "למחוק?" confirm inline, second click calls TaskService.deleteTask()
- isUpdating flag: opacity 0.5 and disabled during PATCH request

## NewTaskDialogComponent

Inputs: defaultStatus: Status
Outputs: closed: EventEmitter<void>, taskCreated: EventEmitter<Task>

IMPORTANT: Use a normal-flow overlay div with min-height: 100vh — NOT position:fixed.
White modal centered, 480px wide, RTL.

Fields (ReactiveFormsModule):

- כותרת: required text input
- תיאור: optional textarea (labeled "תיאור · אופציונלי")
- סטטוס: native select pre-filled from defaultStatus
- עדיפות: 3-button pill toggle (גבוהה/בינונית/נמוכה), default בינונית, selected = dark filled

Footer: "POST /tasks" hint on right, ביטול + "צור משימה" buttons on left.
On submit: call TaskService.createTask() with form values + userId from AuthService, emit taskCreated, close.

## BoardComponent

Main page after login.

On init:

- Get current user from AuthService
- Call TaskService.loadTasksForUser(userId)
- Subscribe to tasks$ and store locally, re-apply filters on every emission

State:

- priorityFilter: signal<'all'|'high'|'medium'|'low'>('all')
- searchQuery: signal<string>('')
- showDialog: boolean
- dialogStatus: signal<Status>('todo')
- filtered: Task[] — derived by applying both filters to the tasks array

Computed column arrays (getters):

- todoTasks: filtered where status === 'todo'
- inProgressTasks: filtered where status === 'in-progress'
- doneTasks: filtered where status === 'done'

Template:

- <app-header> with taskCount and addTask handler
- Toolbar: search input (right), priority filter pill buttons (left) — הכל/גבוהה/בינונית/נמוכה
- @if loading: skeleton (3 columns, each with sk-header + 2 sk-card divs, shimmer animation)
- @else if error: red error banner
- @else: 3 <app-kanban-column> components in a flex row
- @if showDialog: <app-new-task-dialog>

## index.html change

<html lang="he" dir="rtl">

## Coding rules

- Every component must list all its dependencies in imports: []
- Never use *ngIf or *ngFor — always @if and @for
- Services injected via inject() not constructor
- takeUntilDestroyed for any long-lived subscriptions
- All components are standalone: true
- Commit message convention: feat(scope): description

## Backend (Supabase)

No local server — the app points straight at the hosted Supabase project.

1. Create a Supabase project; copy the Project URL + publishable/anon key into
   `src/environments/environment.ts` (and `environment.prod.ts` / Vercel env).
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then
   `supabase/seed.sql` (imports `alice@example.com` / `alice123` and
   `bob@example.com` / `bob123`).
3. Auth → Providers: enable Google (needs a Google Cloud OAuth client with
   redirect URI `https://<ref>.supabase.co/auth/v1/callback`).
4. Auth → URL config: add `http://localhost:4200` and the Vercel domain to the
   redirect allow-list.

```bash
npm start   # ng serve on :4200 — that's the whole dev loop now
```

`npm run build` (and the Vercel `buildCommand`) run `scripts/generate-env.mjs`
first: if env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY` are both set it
rewrites `src/environments/environment.prod.ts` from them, otherwise the
committed file is used. A bare `ng build` skips the script.
