# Interview Prep — Stack Task Dashboard

A quick-reference guide for explaining the technical decisions in this project.
Each section is a likely interview question + how to answer it confidently.

---

## "Tell me about the project"

> "It's a Kanban task manager built with Angular 21. Three columns — Todo, In Progress, Done — with drag-and-drop between them, priority filtering, search, and inline editing. The UI is in Hebrew with full RTL layout. The backend is json-server, which is basically a REST API that reads and writes a JSON file, so the whole thing runs locally with two commands. I also deployed it — the frontend is on Vercel and the API is on Render.com."

**Key numbers to mention:** 3 services, 4 components, 1 guard, 1 interceptor, 32 unit tests, 28 E2E tests.

---

## "Why Angular? Why not React?"

> "The project spec called for Angular. Within Angular, I used the modern API — standalone components, signals, functional guards — rather than the older NgModule-based style. Angular's opinionated structure (services, DI, HTTP client, router all built in) made sense for a CRUD app with real auth and routing. I didn't need to assemble a stack from scratch."

---

## "What does standalone components mean? Why no NgModules?"

> "Before Angular 14, every component had to belong to an NgModule that declared it, and you imported other modules to get access to their components and directives. It was a lot of boilerplate — you could have a one-line component and a 30-line module wrapping it.

> Standalone components declare their own `imports` array directly. You look at one file and you see everything it depends on. There's no module tree to trace. Angular made standalone the default from v17 onward, so I used it throughout."

**Key phrase:** "Self-describing — one file, one component, no module tree."

---

## "What is OnPush change detection and why did you use it?"

> "Angular's default mode (`CheckAlways`) re-renders every component on every event anywhere in the app — a click, a timer, an HTTP response. It works, but it's wasteful.

> OnPush means: only re-render this component when one of its `@Input()` references changes, when an event fires from its own template, or when a signal it reads produces a new value. Everything else is skipped.

> I used it everywhere, not mainly for performance, but for correctness. If a component doesn't re-render when data changes, that means there's a data-flow bug — the data didn't go through the right channel. OnPush makes that obvious instead of hiding it."

**Key phrase:** "Forces clean data flow. If it doesn't render, there's a bug, not lazy."

---

## "What are signals and why did you use them?"

> "Signals are Angular's reactive primitive — introduced in v17, stable in v18. A signal holds a value, and any component or computed value that reads it is automatically tracked. When the signal changes, only the things that read it get updated.

> Before signals, we managed reactive state with RxJS Observables and BehaviorSubjects. They work well, but connecting them to templates requires the `async` pipe or manual subscriptions, and under OnPush change detection there are timing issues."

---

## "What was the problem with markForCheck?"

This is the most important technical story in the project. Practice this answer.

> "The board component originally worked like this:

```typescript
// The OLD approach that broke
this.taskService.tasks$.subscribe(tasks => {
  this.allTasks = tasks;
  this.cdr.markForCheck(); // tell Angular: please re-render me
});
```

> `markForCheck()` schedules a check for the next change-detection cycle. But with OnPush, that cycle is driven by zone.js event hooks. The sequence was:

> 1. HTTP response arrives, Observable emits new tasks
> 2. Subscribe callback fires, sets `this.allTasks`, calls `markForCheck()`
> 3. Angular schedules a check — but it hasn't run yet
> 4. The `computed()` arrays that depend on `allTasks` are already stale by the time the check runs

> In practice: the columns would sometimes not update after a task was created or moved. The UI showed old data.

> The fix was to bridge the Observable into the signal graph with `toSignal()`:

```typescript
// The WORKING approach
private allTasks = toSignal(this.taskService.tasks$, { initialValue: [] });

todoTasks    = computed(() => this.allTasks().filter(t => t.status === 'todo'));
inProgress   = computed(() => this.allTasks().filter(t => t.status === 'in-progress'));
doneTasks    = computed(() => this.allTasks().filter(t => t.status === 'done'));
```

> Signal updates are **synchronous** — when `toSignal` pushes a new value into the signal, all `computed()` values that read it recalculate immediately in the same tick. No scheduling, no race condition."

**Key phrase:** "Signals are synchronous and glitch-free. markForCheck() is async and races against the render cycle."

---

## "Why use BehaviorSubject in services instead of signals?"

> "Services in this project share state across components. `BehaviorSubject` is the right tool for that layer because:
> - It has a current value you can always read synchronously (`.getValue()`)
> - It's an Observable, so components that want the stream can subscribe
> - `toSignal()` in the component then wraps it for the template layer

> I didn't put signals directly in the services because signals don't have a `next()` method — they're designed for derived/reactive values, not imperative push. The pattern here is: **BehaviorSubject in the service, toSignal() at the component boundary.**"

---

## "Why no NgRx / Redux?"

> "NgRx would be the right call for a large app with many features sharing the same slice of state, cross-feature interactions, or a need for time-travel debugging.

> This app has one data source (the task list), two services, and no cross-feature state. Adding NgRx would mean writing actions, reducers, selectors, and effects for operations that are currently a handful of `tap()` calls. That's overhead without benefit. I'd introduce it if the app grew to multiple feature modules that needed to read each other's state."

---

## "Tell me about the auth guard"

> "I wrote it as a `CanActivateFn` — a plain function, not a class implementing `CanActivate`. The functional form uses `inject()` to get services, which is cleaner than constructor injection in a class.

> The guard returns `true` if the user is logged in. If not, instead of calling `router.navigate(['/login'])`, it returns `router.createUrlTree(['/login'])`:

```typescript
return router.createUrlTree(['/login']);
```

> The difference: calling `navigate()` from inside a guard fires a **second navigation** while the first one is still in flight. The router has to cancel both and re-run. There's a race window where the guarded page can briefly flash before the redirect lands.

> Returning a `UrlTree` tells the router: cancel this navigation atomically and redirect instead. One operation, no race."

**Key phrase:** "UrlTree cancels the navigation atomically. navigate() races against it."

---

## "Tell me about the interceptor"

> "It's a `HttpInterceptorFn` — again, a plain function. It reads the Bearer token from `AuthService` and clones every outgoing request with an `Authorization` header:

```typescript
return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
```

> The `clone()` is important — HTTP requests are immutable in Angular. You can't mutate the original, you return a modified copy.

> It's registered in `app.config.ts` using `provideHttpClient(withInterceptors([authInterceptor]))`, which is the modern functional interceptor API."

---

## "How does drag and drop work?"

> "I used the browser's native HTML5 drag API — no library. The task card sets `draggable="true"` and stores its task ID in `dataTransfer` on `dragstart`. Each column listens for `dragover` and `drop` events.

> On drop, the column emits `{ taskId, newStatus }` up to the board, which calls `TaskService.updateTask()` with the new status."

**The dragCounter question:**

> "There's a subtle bug with native drag events. When you drag over a column that has child elements (task cards), the browser fires `dragleave` on the column every time the pointer enters a child element, then fires `dragenter` again when it exits the child back to the column. This causes the drop-zone highlight to flicker rapidly.

> The fix is a `dragCounter` integer in the column component:

```typescript
onDragEnter() { this.dragCounter++; this.isDragOver = true; }
onDragLeave() { this.dragCounter--; if (this.dragCounter === 0) this.isDragOver = false; }
onDrop()      { this.dragCounter = 0; this.isDragOver = false; }
```

> The highlight only clears when the counter reaches zero, meaning the pointer has fully exited all elements in the column."

---

## "What's the RTL approach?"

> "I set `body { direction: rtl }` globally and wrote all layout for RTL from the start — no overrides later. In RTL flex containers, the first element in the DOM is the rightmost on screen. So the HTML element order mirrors the visual order from right to left.

> For example, in the header: the logo comes first in the DOM (rightmost), then the divider, then the title. The button group comes last in the DOM (leftmost). That's consistent throughout every component."

---

## "How did you handle dark mode?"

> "CSS custom properties as design tokens. All colors in the app reference variables like `--bg`, `--surface`, `--text-primary`. The `:root` block defines the light-mode values.

> For dark mode I added a `[data-theme='dark']` block that overrides those same variables. Then a `ThemeService` toggles the attribute on `<html>`:

```typescript
document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
```

> The service reads `prefers-color-scheme` on first load (so it respects the OS setting), persists the user's choice in `localStorage`, and exposes an `isDark` signal for the template to bind the sun/moon icon."

---

## "Tell me about testing"

### Unit tests

> "Angular 18+ ships with `@angular/build:unit-test` which runs **Vitest** under the hood with **HappyDOM**. No Karma, no custom config — just `npm test`. I wrote 32 tests across two spec files: `auth.service.spec.ts` (12 tests) and `task.service.spec.ts` (20 tests).

> Two Angular 21 testing quirks worth knowing:
> 1. `HttpClientTestingModule` is deprecated. The correct setup is `providers: [provideHttpClient(), provideHttpClientTesting()]`.
> 2. HappyDOM's `localStorage` doesn't fully implement the `Storage` interface — `.clear()` doesn't exist. I fixed it with `vi.stubGlobal('localStorage', fakeMock)` using a plain object.

> For async assertions I used `firstValueFrom()` instead of the `done` callback, because Vitest doesn't support `done`."

### E2E tests

> "Playwright, 28 tests across 4 spec files: login, board layout, task CRUD, drag-and-drop. `playwright.config.ts` starts both servers automatically with `webServer`, and I set `workers: 1` because the tests share a live `db.json`.

> The main lesson: `locator.count()` reads the DOM immediately without retrying. Any assertion after an async Angular re-render has to use `expect(locator).toHaveCount()`, which retries until the timeout. I hit this bug on the priority filter test and it was flaky until I fixed it.

> Tests that need specific tasks create them via the json-server API in `beforeEach` and delete them in `afterEach`. That way they're self-contained and don't depend on whatever's in `db.json` from manual usage."

---

## "How did you deploy it?"

> "Two separate deployments:

> **Frontend → Vercel.** I added a `vercel.json` with a single rewrite rule: every URL serves `index.html`. Without this, refreshing `/board` returns 404 because Vercel looks for a `/board` file that doesn't exist — Angular handles routing client-side.

> **API → Render.com.** I added `render.yaml` (Render Blueprint) that runs `npx json-server db.json --port $PORT --host 0.0.0.0`. The `--host 0.0.0.0` is important — without it json-server only binds to localhost and Render can't route external traffic to it.

> Environment switching uses Angular's `environment.ts` / `environment.prod.ts` with `fileReplacements` in `angular.json`. Dev points to `localhost:3000`, prod points to the Render URL. The build swaps the file automatically."

---

## Quick-fire answers

| Question | One-line answer |
|---|---|
| Why `inject()` not constructor injection? | Shorter, works in functions (guards/interceptors), tree-shakeable |
| What is `providedIn: 'root'`? | Makes the service a singleton at app level, no module needed |
| Why one TaskDialog for create and edit? | Shared code, one bug fix covers both modes |
| What's `tap()` in RxJS? | Side-effect operator — runs a function, passes the value through unchanged |
| What's `catchError()` in RxJS? | Intercepts errors, lets you return a fallback Observable (`of([])`) so the stream doesn't die |
| What's `firstValueFrom()`? | Converts an Observable to a Promise (takes the first emitted value) — used in Vitest |
| Why `toHaveCount()` not `count()` in Playwright? | `toHaveCount` retries; `count()` reads once immediately — fails on async re-renders |
| What is json-server? | A zero-config REST API that uses a JSON file as its database |

---

## If they ask you to change something on the spot

Common live-coding asks:
- **"Add a due-date field"** → Add field to `Task` model, add input to `TaskDialogComponent` form, add display to `TaskCardComponent`
- **"Add a second user's board"** → Already works — `loadTasksForUser(userId)` filters by userId
- **"Make the search case-insensitive"** → Already is: `.toLowerCase()` on both sides in `filtered` computed
- **"Add a loading spinner per card"** → `isUpdating` flag already exists on `TaskCardComponent`
