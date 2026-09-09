-- Stack — optional per-task due date. Paste into the Supabase SQL editor.
alter table public.tasks add column if not exists due_date date;
