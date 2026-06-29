export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  token: string;
}

export interface Task {
  id: number;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'high' | 'medium' | 'low';
  userId: number;
  description?: string;
}

export type Priority = Task['priority'];
export type Status = Task['status'];
