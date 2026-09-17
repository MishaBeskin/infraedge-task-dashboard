/** A team-scoped, time-boxed sprint. One team can have any number of sprints;
 *  at most one may be `'active'` at a time (enforced by a partial unique
 *  index server-side). `startsOn` / `endsOn` are optional ISO `YYYY-MM-DD`
 *  dates (date only, no time), same shape as `Task.dueDate`. */
export interface Sprint {
  id: string;
  teamId: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  status: 'planned' | 'active' | 'completed';
  /** Sort order in the sprint list / selector. */
  position: number;
  createdAt: string;
}

export type SprintStatus = Sprint['status'];

/** Fields the client supplies when creating a sprint. `status` is always
 *  `'planned'` and `position` is assigned by SprintService (max + 1). */
export type NewSprint = Pick<Sprint, 'name'> & {
  startsOn?: string | null;
  endsOn?: string | null;
};
