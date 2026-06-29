# Stack — Task Management Dashboard

A Kanban-style task manager built in Angular 21. Three columns (Todo / In Progress / Done), drag-and-drop between them, priority filtering, search, and inline editing. The UI is fully in Hebrew with right-to-left layout throughout.

The backend is [json-server](https://github.com/typicode/json-server), so there is no real API — `db.json` acts as the database. This makes the project self-contained and easy to run locally.

---

## Getting started

```bash
npm install

# Terminal 1 — API on :3000
npm run server

# Terminal 2 — Angular dev server on :4200
npm start
```

Or run both at once:

```bash
npm run dev
```

Login with one of the seeded accounts from `db.json`:

| Email | Password |
|---|---|
| alice@example.com | alice123 |
| bob@example.com | bob123 |

---

## Running tests

```bash
# Unit tests (Vitest)
npm test

# End-to-end tests (Playwright — starts servers automatically if not already running)
npm run e2e

# Playwright with the interactive UI
npm run e2e:ui
```

---

## Project structure

```
src/app/
├── models/
│   └── task.model.ts          — User, Task interfaces + Priority/Status union types
├── services/
│   ├── auth.service.ts        — session management, localStorage persistence
│   └── task.service.ts        — CRUD operations, in-memory state via BehaviorSubject
├── guards/
│   └── auth.guard.ts          — redirects unauthenticated users to /login
├── interceptors/
│   └── auth.interceptor.ts    — attaches Bearer token to every outgoing request
├── pages/
│   ├── login/                 — two-panel login page (branding + form)
│   └── board/                 — main Kanban board
└── components/
    ├── header/                — app bar with logo, task count, avatar, logout
    ├── kanban-column/         — droppable column that renders a list of TaskCards
    ├── task-card/             — individual task with status select, edit, delete
    └── task-dialog/           — shared create/edit modal

e2e/
├── helpers.ts                 — login(), apiPost(), apiDelete() shared utilities
├── login.spec.ts
├── board.spec.ts
├── task-crud.spec.ts
└── drag-drop.spec.ts
```

---

## Architecture decisions

### Standalone components, no NgModules

Every component is `standalone: true` and declares its own `imports`. There are no NgModules anywhere in the project. This is the direction Angular has been moving since v14 and is the default from v17 onward. The result is that each component is self-describing — you can read what it depends on without tracing a module tree.

### OnPush change detection everywhere

All components use `ChangeDetectionStrategy.OnPush`. This means Angular only re-renders a component when one of its inputs changes, when an event fires from its template, or when a signal it reads changes value. The performance benefit is secondary; the main reason is that it forces a cleaner separation between data and view — if something doesn't re-render, the data flow has a bug rather than the component being lazy.

### Signals + computed() for derived state (not subscriptions)

The board originally used `subscribe() + markForCheck()` to keep the three column arrays in sync with `TaskService.tasks$`. That approach broke under OnPush because the check was scheduled before the new value had finished propagating through the component tree.

The fix was to bridge the Observable into the signal graph with `toSignal()` and then derive column arrays with `computed()`:

```typescript
private allTasks = toSignal(this.taskService.tasks$, { initialValue: [] });

todoTasks       = computed(() => this.filtered().filter(t => t.status === 'todo'));
inProgressTasks = computed(() => this.filtered().filter(t => t.status === 'in-progress'));
doneTasks       = computed(() => this.filtered().filter(t => t.status === 'done'));
```

Angular's signal graph is synchronous and glitch-free, so the columns always update in the same tick as the underlying data.

### Services use BehaviorSubject, not a state management library

`TaskService` holds a `BehaviorSubject<Task[]>` for the task list plus two more for `loading` and `error` state. After every write operation (POST / PATCH / DELETE), the service updates the subject locally using the server's confirmed response — no refetch needed.

NgRx or similar would be overkill here. The state is small, there is only one data source, and there are no cross-feature interactions. Adding a store would mean writing actions, reducers, selectors, and effects for operations that are currently a handful of `tap()` calls.

### Functional guard and interceptor

`authGuard` is a `CanActivateFn` and `authInterceptor` is an `HttpInterceptorFn`. Both are plain functions that use `inject()` internally. The alternative — class-based guards implementing `CanActivate` — requires the same logic wrapped in a class with a constructor just to satisfy an interface. The functional form is shorter and easier to test.

The guard returns a `UrlTree` rather than calling `router.navigate()`. This lets the router cancel the current navigation atomically; calling `navigate()` from inside a guard races against the in-flight navigation and can briefly flash the guarded page before the redirect lands.

### One TaskDialog component for both create and edit

There is a single `TaskDialogComponent` that accepts a `mode: 'create' | 'edit'` input. In create mode it pre-fills the status from whichever column's + button was clicked. In edit mode it patches the form from the existing task.

The alternative was two separate dialog components. They started identical and would have diverged slowly over time, with bug fixes applied to one but not the other. A shared component with a mode flag keeps the surface area small.

### RTL-first layout

`body { direction: rtl }` is set globally. All layout is written for RTL from the start rather than added as an override. In flex containers, "first in DOM" means "rightmost on screen" — the column header and task card HTML reflect this consistently. There are no LTR-to-RTL overrides anywhere.

### HTML5 drag-and-drop (no library)

The drag-and-drop uses the browser's native `dragstart` / `dragover` / `drop` events. The task ID is passed via `dataTransfer` and the drop emits `{ taskId, newStatus }` up to the board, which calls `updateTask()`.

The only non-obvious part is `dragCounter` in `KanbanColumnComponent`. The browser fires `dragleave` on a parent element whenever the pointer enters one of its children, which causes the drop-zone highlight to flicker. The counter tracks how many nested enter/leave events are in flight and only clears the highlight when it reaches zero.

---

## Testing strategy

### Unit tests — Vitest via `@angular/build:unit-test`

Angular 18+ ships with a built-in test runner (`@angular/build:unit-test`) that runs Vitest under the hood with HappyDOM. There is no Karma, no custom Vitest config, and no `karma.conf.js`. Just `npm test`.

Coverage lives in two spec files:

**`auth.service.spec.ts`** (12 tests) — construction, localStorage session restore, login success and failure, correct API URL, `currentUser$` emissions, logout, `getToken`.

**`task.service.spec.ts`** (20 tests) — initial state, `loadTasksForUser` (URL shape, loading flags, population, error handling, error clearing on retry), `createTask` (POST, append, preserve existing tasks), `updateTask` (PATCH, in-place replacement, no side effects on other tasks), `deleteTask` (DELETE, removal, no side effects).

Both use `provideHttpClient()` + `provideHttpClientTesting()` — the Angular 18+ replacement for the deprecated `HttpClientTestingModule`. HappyDOM's localStorage is incomplete, so the auth tests stub it with `vi.stubGlobal` using a plain object.

All async assertions use `firstValueFrom()` rather than the `done` callback, which Vitest does not support.

### E2E tests — Playwright

Four spec files running against Chromium only, sequentially (`workers: 1`) since they share the live `db.json`.

`playwright.config.ts` declares both servers in the `webServer` array with `reuseExistingServer: true`, so Playwright starts them if they are not already running and reuses them if they are.

**`login.spec.ts`** (7 tests) — page renders correctly, field validation, wrong-credential error, successful login, password visibility toggle, logout.

**`board.spec.ts`** (8 tests) — three columns with correct titles, count badges match card counts, known tasks in correct columns, header task count, priority filter hides non-matching cards, filter reset, search, search clear.

**`task-crud.spec.ts`** (11 tests) — dialog opens with correct pre-selected status, cancel and ✕ close it, empty-title validation, task creation appears in column, edit dialog pre-filled with task data, save edit updates card in place, two-step delete with countdown, status select moves card between columns.

**`drag-drop.spec.ts`** (2 tests) — dragging a card to another column moves it there, dragging over a column applies the highlight class.

Tests that need a specific task create it via the json-server API in `beforeEach` (before navigating to the board, so it loads with the task already visible) and delete it in `afterEach`. All test-created tasks use an `[E2E]` title prefix so they are easy to identify in `db.json` if cleanup fails.

One Playwright gotcha worth knowing: `locator.count()` reads the DOM immediately without retrying. Any assertion that needs to wait for Angular to re-render after an interaction must use `expect(locator).toHaveCount()` instead, which retries until the timeout.
