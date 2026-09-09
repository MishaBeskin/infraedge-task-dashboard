/** A team the signed-in user belongs to. One team == one shared board; the
 *  team name is the board name. `role` is the caller's role in this team. */
export interface Team {
  id: string;
  name: string;
  role: 'owner' | 'member';
}

/** A member row for the team panel (Pass B). */
export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
}

/** A pending invitation for the team panel (Pass B). `email` is null for a
 *  shareable link invite. */
export interface TeamInvitation {
  id: string;
  email: string | null;
  token: string;
  role: 'owner' | 'member';
  createdAt: string;
  expiresAt: string;
}

export type TeamRole = Team['role'];
