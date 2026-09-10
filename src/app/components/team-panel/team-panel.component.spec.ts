import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { TeamPanelComponent } from './team-panel.component';
import { TeamService } from '../../services/team.service';
import { AuthService } from '../../services/auth.service';
import { Team, TeamInvitation, TeamMember } from '../../models/team.model';

const OWNER: TeamMember = { userId: 'u1', name: 'Me Myself', email: '', role: 'owner' };
const MEMBER: TeamMember = { userId: 'u2', name: 'Bob Roe', email: '', role: 'member' };

class FakeTeamService {
  teams = signal<Team[]>([
    { id: 't1', name: 'Alpha', role: 'owner' },
    { id: 't2', name: 'Beta', role: 'member' },
  ]);
  activeTeamId = signal<string>('t1');
  activeTeam = computed<Team | null>(
    () => this.teams().find((t) => t.id === this.activeTeamId()) ?? null,
  );
  members = signal<TeamMember[]>([OWNER, MEMBER]);

  loadActiveMembers = vi.fn();
  loadInvitations = vi.fn((_id: string) => of<TeamInvitation[]>([]));
  inviteByEmail = vi.fn((_id: string, _email: string) => of(undefined));
  createLinkInvite = vi.fn((_id: string) => of<TeamInvitation>(link()));
  revokeInvite = vi.fn((_id: string) => of(undefined));
  removeMember = vi.fn((_teamId: string, _userId: string) => of(undefined));
  leaveTeam = vi.fn((_id: string) => of(undefined));
  deleteTeam = vi.fn((_id: string) => of(undefined));
}

function link(): TeamInvitation {
  return {
    id: 'lnk',
    email: null,
    token: 'tok123',
    role: 'member',
    createdAt: '2026-01-01',
    expiresAt: '2026-02-01',
  };
}

function mount(role: Team['role'] = 'owner') {
  const team = new FakeTeamService();
  team.teams.set([
    { id: 't1', name: 'Alpha', role },
    { id: 't2', name: 'Beta', role: 'member' },
  ]);
  TestBed.configureTestingModule({
    providers: [
      { provide: TeamService, useValue: team },
      { provide: AuthService, useValue: { getCurrentUser: () => ({ id: 'u1' }) } },
    ],
  });
  const fixture = TestBed.createComponent(TeamPanelComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  return { fixture, comp: fixture.componentInstance, team };
}

describe('TeamPanelComponent', () => {
  afterEach(() => {
    document.querySelectorAll('app-team-panel').forEach((el) => el.remove());
    TestBed.resetTestingModule();
  });

  it('renders a row per member and marks the current user', () => {
    const { fixture } = mount('owner');
    const rows = fixture.nativeElement.querySelectorAll('.member-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Me Myself');
    expect(rows[0].querySelector('.member-you')).toBeTruthy();
    expect(rows[1].querySelector('.member-you')).toBeNull();
  });

  it('an owner sees the invite section and a per-member remove for others only', () => {
    const { fixture } = mount('owner');
    expect(fixture.nativeElement.querySelector('.invite-form')).toBeTruthy();
    const actions = fixture.nativeElement.querySelectorAll('.member-row .row-action');
    expect(actions.length).toBe(1); // only the non-owner, non-self row
  });

  it('a plain member sees no invite section, no remove, no delete', () => {
    const { fixture } = mount('member');
    expect(fixture.nativeElement.querySelector('.invite-form')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.member-row .row-action').length).toBe(0);
    const dangerButtons = fixture.nativeElement.querySelectorAll('.btn-danger');
    expect(dangerButtons.length).toBe(1); // just "Leave team"
  });

  it('remove takes two clicks: arm, then confirm calls the service and emits changed', () => {
    const { fixture, comp, team } = mount('owner');
    let changed = 0;
    comp.changed.subscribe(() => changed++);
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.member-row .row-action');

    btn.click();
    fixture.detectChanges();
    expect(team.removeMember).not.toHaveBeenCalled();
    expect(btn.classList.contains('is-armed')).toBe(true);

    btn.click();
    fixture.detectChanges();
    expect(team.removeMember).toHaveBeenCalledWith('t1', 'u2');
    expect(team.loadActiveMembers).toHaveBeenCalled();
    expect(changed).toBe(1);
  });

  it('disables leave / delete when it is the only team', () => {
    const { fixture, team } = mount('owner');
    team.teams.set([{ id: 't1', name: 'Alpha', role: 'owner' }]);
    fixture.detectChanges();
    const danger = Array.from(
      fixture.nativeElement.querySelectorAll('.btn-danger'),
    ) as HTMLButtonElement[];
    expect(danger.length).toBe(2);
    expect(danger.every((b) => b.disabled)).toBe(true);
  });

  it('sends an email invite with a trimmed address and shows the sent notice', () => {
    const { fixture, comp, team } = mount('owner');
    comp.form.controls.email.setValue('  new@x.co  ');
    comp.inviteByEmail();
    fixture.detectChanges();

    expect(team.inviteByEmail).toHaveBeenCalledWith('t1', 'new@x.co');
    expect(comp['notice']()).toBe('teamPanel.invite.sent');
  });

  it('maps a no_account RPC error to its message key', () => {
    const { comp, team } = mount('owner');
    team.inviteByEmail.mockReturnValueOnce({
      subscribe: (o: { error: (e: unknown) => void }) => o.error(new Error('no_account')),
    } as never);
    comp.form.controls.email.setValue('ghost@x.co');
    comp.inviteByEmail();
    expect(comp['error']()).toBe('teamPanel.invite.error.noAccount');
  });

  it('on email_failed shows the fallback message and re-reads invitations', () => {
    const { comp, team } = mount('owner');
    team.inviteByEmail.mockReturnValueOnce({
      subscribe: (o: { error: (e: unknown) => void }) => o.error(new Error('email_failed')),
    } as never);
    team.loadInvitations.mockClear();
    comp.form.controls.email.setValue('x@y.co');
    comp.inviteByEmail();

    expect(comp['error']()).toBe('teamPanel.invite.error.emailFailed');
    expect(team.loadInvitations).toHaveBeenCalled(); // copy-link row will appear
  });

  it('shows a copy-link button on a pending email invite', () => {
    const team = new FakeTeamService();
    team.loadInvitations = vi.fn(() =>
      of<TeamInvitation[]>([
        {
          id: 'i1',
          email: 'x@y.co',
          token: 'tok-x',
          role: 'member',
          createdAt: '2026-01-01',
          expiresAt: '2026-02-01',
        },
      ]),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: TeamService, useValue: team },
        { provide: AuthService, useValue: { getCurrentUser: () => ({ id: 'u1' }) } },
      ],
    });
    const fixture = TestBed.createComponent(TeamPanelComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('.invite-row');
    expect(row.textContent).toContain('x@y.co');
    const actions = row.querySelectorAll('.row-action');
    expect(actions.length).toBe(2); // copy + revoke
    expect(fixture.componentInstance.linkUrl('tok-x')).toContain('/invite/tok-x');
  });

  it('Escape emits closed', () => {
    const { fixture, comp } = mount('owner');
    let closed = 0;
    comp.closed.subscribe(() => closed++);
    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closed).toBe(1);
  });
});
