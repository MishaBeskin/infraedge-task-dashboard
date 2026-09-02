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
  /** Sort order within a status column. */
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Fields the client supplies when creating a task. `user_id` is set by the
 *  database (default auth.uid()); `position` is assigned by TaskService. */
export type NewTask = Pick<Task, 'title' | 'status' | 'priority'> & {
  description?: string;
};

/** Fields the client may change on an existing task. */
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'position'>
>;

export type Priority = Task['priority'];
export type Status = Task['status'];
