/** The authenticated user, as the app needs it. Derived from the Supabase
 *  session — no password or token is ever held client-side. */
export interface AppUser {
  id: string;
  name: string;
  email: string;
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'high' | 'medium' | 'low';
  description?: string;
  /** Optional due date, ISO `YYYY-MM-DD` (date only, no time). */
  dueDate?: string;
  /** The team (== board) this task belongs to. */
  teamId: string;
  /** Team member the task is assigned to, or null/undefined for unassigned. */
  assigneeId?: string | null;
  /** Sort order within a status column. */
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client supplies when creating a task. `user_id` is set by the
 *  database (default auth.uid()); `position` and `team_id` are supplied by
 *  TaskService (team_id from the active team). */
export type NewTask = Pick<Task, 'title' | 'status' | 'priority'> & {
  description?: string;
  dueDate?: string;
  assigneeId?: string | null;
};

/** Fields the client may change on an existing task. */
export type TaskPatch = Partial<
  Pick<
    Task,
    'title' | 'description' | 'status' | 'priority' | 'position' | 'dueDate' | 'assigneeId'
  >
>;

export type Priority = Task['priority'];
export type Status = Task['status'];
