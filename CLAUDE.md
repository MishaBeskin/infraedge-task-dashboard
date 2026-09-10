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

## Responsive

The app is responsive from ~360px up. One SCSS breakpoint drives it:
`src/styles/_breakpoints.scss` exports `$mobile: 768px` (and `$phone: 400px`),
`@use`d by the component stylesheets — media queries can't read CSS custom
properties, so these are SCSS vars, not tokens. At/below `$mobile` the board's
three `.board-columns` stack vertically (each full-width, page scrolls, no inner
scroll cap), the login 50/50 split stacks, the header bar wraps, and the toolbar
wraps with search on its own row. Keep RTL correct at every breakpoint — use
logical properties (`inline-start`/`inline-end`, `padding-inline`), never
`left`/`right`. Touch tap-target bumps go under `@media (pointer: coarse)` so
desktop density is unaffected.

## Data models

File: src/app/models/task.model.ts

interface AppUser { id: string, name, email } // derived from the Supabase session; no password/token client-side
interface Task { id: string, title, status: 'todo'|'in-progress'|'done', priority: 'high'|'medium'|'low', description?, dueDate?, position, createdAt, updatedAt }
type NewTask = Pick<Task,'title'|'status'|'priority'> & { description?, dueDate? }
type TaskPatch = Partial<Pick<Task,'title'|'description'|'status'|'priority'|'position'|'dueDate'>>
type Priority = Task['priority']
type Status = Task['status']

## Data access (Supabase)

All access goes through `SupabaseService` (owns the single `SupabaseClient`).

- Auth: `supabase.auth` — password, magic link, Google OAuth. Session persisted
  by the client, restored on load, refreshed automatically.
- `tasks` table: `supabase.from('tasks').select/insert/update/delete`. As of
  Phase 2 (`0004_teams.sql`) tasks are **team-scoped**: RLS is
  `is_team_member(team_id)` for all four verbs — no more `auth.uid() = user_id`.
  TaskService passes `.eq('team_id', activeTeamId)` explicitly and sets `team_id`
  on insert (from the active team). `due_date` (nullable `date`, Phase 1) is the
  optional per-task due date; `assignee_id` (nullable, FK `auth.users`, Phase 2)
  is the assignee (nulled by a trigger when the member leaves).
- DB columns are snake_case (`user_id`, `created_at`, `position`, `due_date`,
  `team_id`, `assignee_id`); TaskService maps rows to the camelCase `Task`
  interface (`dueDate`, `teamId`, `assigneeId`).
- `teams` / `team_members` / `team_invitations` (Phase 2): one team == one shared
  board, team name == board name. `team_members.role` is `owner` | `member`.
  Helper SQL functions `is_team_member(t uuid)` / `is_team_owner(t uuid)` are
  `SECURITY DEFINER` (break RLS recursion) and back every policy. RPCs
  (`SECURITY DEFINER`): `create_team(p_name)`, `accept_invitation(tok)`,
  `invite_to_team(p_team_id, p_email, p_role)`, `delete_team(p_team_id)`,
  `leave_team(p_team_id)`. All read/written by `TeamService`; `activeTeamId` is
  persisted per-uid in `localStorage['stack_active_team:<uid>']`.
- `TeamService.members` (signal) + `loadActiveMembers()` (Phase 2 Pass B): the
  active team's roster, refreshed by BoardComponent on every team change and by
  the team panel after a membership edit. Consumed by the task dialog's assignee
  select and the task-card avatar chip. `fetchMembers` is a two-step read
  (`team_members` then `profiles.in(ids)`, merged client-side) — there is **no
  FK** between `team_members` and `profiles`, so a `profiles(...)` PostgREST
  embed fails.
- `profiles` table: one row per user (auto-created by `handle_new_user`), holds
  `name`. `profiles.board_name` is **deprecated** — the team name replaces it
  (kept only for the `0004` data migration; `BoardSettingsService` is gone).
- `assignee_id` writes are gated by the `tasks_enforce_assignee` BEFORE
  INSERT/UPDATE trigger (`0006`): a team **owner** sets it freely; a plain
  **member** may only move it between `NULL` and their own uid. Anything else
  raises `assignee_forbidden`. (`unassign_removed_member` from `0004` still works
  — the owner removing someone is `is_team_owner`; a member leaving only clears
  their own uid.)
- Schema: run `supabase/migrations/0001_init.sql`, then `0002_board_name.sql`,
  `0003_due_date.sql`, `0004_teams.sql`, `0005_invite_token.sql`,
  `0006_assignee_permission.sql` (in order), then `supabase/seed.sql` (fallback
  `scripts/create-users.mjs`).
- `supabase/functions/send-team-invite/` (Pass B, Option C): Deno Edge Function
  that emails the invite link via the **SendGrid HTTP API**. `0005` makes
  `invite_to_team` return the token it needs. Secrets: `SENDGRID_API_KEY`,
  `SITE_URL`, optional `SENDGRID_FROM_EMAIL` / `SENDGRID_FROM_NAME`
  (`SUPABASE_URL` / `SUPABASE_ANON_KEY` are auto-injected). Deploy with the
  Supabase CLI or the dashboard function editor.

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
- /invite/:token → InviteComponent (shareable-invite target, Phase 2 Pass B — no
  guard: it handles the signed-out case itself by stashing the token and
  bouncing through /login, which honours `?redirect=`)
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
- reorderColumn(status, orderedIds): persists within-column order. Assigns position = 1..N over orderedIds and flips status on any card that changed column. Optimistic tasks$ update, then PATCHes in parallel ONLY the rows whose position/status actually changed; reverts tasks$ to the pre-move snapshot and errors on any failure. Returns Observable<void>. Supersede key `reorder:<status>`. No network call when the order is unchanged.

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

Behavior: ReactiveFormsModule, on submit call AuthService.login(), on success
navigate to `?redirect=` when it is a safe in-app path (an invite link bounced
the user here), otherwise /board.

## HeaderComponent

Inputs: taskCount: number
Outputs: addTask: EventEmitter<void>

RTL horizontal bar, white background, 64px height.

- Right side: orange avatar circle with user initials, orange "משימה חדשה +" button
- Center: "[N] משימות" in muted color
- Left side: "● stack" logo, logout arrow button that calls AuthService.signOut() then navigates to /login

## KanbanColumnComponent

Inputs: title: string, tasks: Task[], status: Status
Outputs: addTask: EventEmitter<Status>, editTask: EventEmitter<Task>,
taskDropped: EventEmitter<{ taskId: string; newStatus: Status; targetIndex: number }>

White card column, rounded corners, max-height with overflow-y scroll.

- Header: column title right-aligned, count badge circle, + button left-aligned
- List of TaskCardComponent, each wrapped in a drop target
- Empty state: dashed border placeholder "אין משימות"
- - button emits addTask with the column's status
- Native HTML5 DnD (no library) for mouse. dragCounter keeps the column highlight
  stable across child enter/leave. dropIndex signal + a `.drop-line` indicator
  show where a card will land; pointer Y within the hovered card picks
  insert-before vs insert-after; dropping on the background appends. onDrop emits
  taskDropped with targetIndex = the slot in this column's rendered (filtered)
  list, 0..list.length. Same-column reordering is supported and persisted via
  TaskService.reorderColumn.
- Touch: HTML5 drag events don't fire on touch, so there's a parallel
  Pointer-Events path (dual-path, split by `(pointer: coarse)` / `(pointer:
fine)`). Each column registers a handle with `PointerDragService`
  (`services/pointer-drag.service.ts`) in ngAfterViewInit / unregisters in
  ngOnDestroy. The service drives the same `isDragOver` / `dropIndex` signals and
  fires the same `taskDropped` output, so BoardComponent and reorderColumn are
  untouched. TaskCard has a `.drag-handle` grip (shown only on coarse pointers,
  `touch-action: none`) that runs `pointerdown` → `start()`, `pointermove` →
  `moveTo()` (preventDefault), `pointerup` → `drop()`, with `setPointerCapture`.
  `moveTo()` uses `document.elementFromPoint` so dragging over a vertically
  stacked column on mobile still resolves the target status.

## TaskCardComponent

Input: task: Task

White card with colored right border by priority (high=red, medium=orange, low=gray).

- Task title
- Priority badge pill (גבוהה/בינונית/נמוכה) colored by priority
- Native <select> for status change (לעשות/בתהליך/הושלם) — on change calls TaskService.updateTask()
- Trash button — first click shows "למחוק?" confirm inline, second click calls TaskService.deleteTask()
- isUpdating flag: opacity 0.5 and disabled during PATCH request
- `draggable="true"` for mouse (HTML5 DnD). A `.drag-handle` grip, shown only on
  `(pointer: coarse)`, starts the touch Pointer-Events drag (see KanbanColumn).
- Assignee avatar chip (Phase 2 Pass B): a small brand-coloured initials circle in
  `.card-meta` when `task.assigneeId` is set. The card injects `TeamService` and
  resolves the id against its `members()` roster signal (`'?'` until it loads).

## NewTaskDialogComponent

Inputs: defaultStatus: Status
Outputs: closed: EventEmitter<void>, taskCreated: EventEmitter<Task>

The shipped `TaskDialogComponent` uses a `position: fixed; inset: 0` overlay
(`z-index: 50`, scroll on the overlay) with a centered white modal (`min(480px,
100vw - 2rem)`), RTL. It also has a due-date field (Phase 1) and an `assignee`
select (Phase 2 Pass B). Focus is trapped and restored on close.

Fields (ReactiveFormsModule):

- כותרת: required text input
- תיאור: optional textarea (labeled "תיאור · אופציונלי")
- תאריך יעד: optional native date input (Phase 1)
- סטטוס: native select pre-filled from defaultStatus
- אחראי: native select, "ללא אחראי" + one option per active-team member
  (`TeamService.members()`); the dialog calls `loadActiveMembers()` on open.
  Submits `assigneeId` (empty → `null`) in the create/update patch.
  **Owner vs member:** only a team owner sees the full roster. A plain member
  gets just "ללא אחראי" + themselves (self-assign / self-unassign); editing a
  task already assigned to someone else, the control is `disable()`d and the
  patch omits `assigneeId` entirely. Enforced server-side by the
  `tasks_enforce_assignee` trigger (`0006`) — a member-issued change of
  `assignee_id` to/from anyone but themselves raises `assignee_forbidden`.
- עדיפות: 3-button pill toggle (גבוהה/בינונית/נמוכה), default בינונית, selected = dark filled

Footer: "POST /tasks" hint on right, ביטול + "צור משימה" buttons on left.
On submit: call TaskService.createTask() with form values + userId from AuthService, emit taskCreated, close.

## TeamPanelComponent (Phase 2 Pass B)

`src/app/components/team-panel/` — the "Manage team" modal opened from the
user-menu (`openTeamPanel` output → BoardComponent `showTeamPanel`). Same
overlay / focus-trap / Escape shell as the other dialogs. Reads everything off
`TeamService` directly; `changed` output tells the board to reload tasks after a
membership edit (the DB trigger nulls the removed member's `assignee_id`).

- Members roster from `TeamService.members()`; the current user's row is tagged
  "אני". Owner gets a per-row remove (two-click arm/confirm) on non-owner,
  non-self rows → `removeMember` then `loadActiveMembers()`.
- Owner-only invite section. Email invite (`inviteByEmail`, trims + normalises
  before `Validators.email`) goes through the **`send-team-invite` Edge
  Function** (SendGrid) — it calls `invite_to_team` then emails a
  `/invite/<token>` link. The function always returns 200 with
  `{ ok, error?, token? }`; `error: 'email_failed'` means the invite row exists
  but the mail bounced, so the panel still refreshes the list to show the
  copy-link fallback. Errors map to `teamPanel.invite.error.*`. Also one
  shareable link (`createLinkInvite`, no email). Every pending row (email + link)
  shows a copy-link button (`copiedToken` tracks which one) + revoke — the
  manual fallback if mail delivery is unavailable.
- Footer "danger zone": "Leave team" (everyone) + "Delete team" (owner,
  two-click). Both disabled — with a tooltip — when it's the caller's only team;
  the `leave_team` / `delete_team` RPCs enforce the same guard server-side.

## InviteComponent (Phase 2 Pass B)

`src/app/pages/invite/` — target of `/invite/:token`. Signed in → `acceptInvite`,
activate that team, go to /board. Signed out → stash the token in
`localStorage['stack_pending_invite']` and route to `/login?redirect=/invite/…`.
BoardComponent's `ngOnInit` also drains that key (the OAuth / magic-link
round-trip lands on /board, not the redirect URL). Terminal errors map to
`invite.error.*` / `invite.wrongAccount`.

## BoardComponent

Main page after login.

On init:

- Get current user from AuthService
- Call TaskService.loadTasksForUser(userId)
- Subscribe to tasks$ and store locally, re-apply filters on every emission

State:

- priorityFilter: signal<'all'|'high'|'medium'|'low'>('all')
- assigneeFilter: signal<string>('all') — 'all' | 'me' | '<userId>'. Client-only
  (RLS already gives every member all team tasks). Reset to 'all' by the
  team-change effect.
- searchQuery: signal<string>('')
- showDialog: boolean
- dialogStatus: signal<Status>('todo')
- filtered: Task[] — derived by AND-composing priority + assignee + search over
  the tasks array

Computed column arrays (getters):

- todoTasks: filtered where status === 'todo'
- inProgressTasks: filtered where status === 'in-progress'
- doneTasks: filtered where status === 'done'

Template:

- <app-header> with taskCount and addTask handler
- Toolbar: search input (right), priority filter pill buttons + an assignee
  filter `<select>` (הכל/גבוהה/בינונית/נמוכה pills, then a native select: כל
  המשימות / המשימות שלי / one option per other team member)
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
   `0002_board_name.sql`, `0003_due_date.sql`, `0004_teams.sql` (in order), then
   `supabase/seed.sql` (imports `alice@example.com` / `alice123` and
   `bob@example.com` / `bob123`). `0004_teams.sql` checkpoints `tasks` into
   `tasks_backup` first; verify row counts, then drop `tasks_backup` by hand.
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
