import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InviteComponent, PENDING_INVITE_KEY } from './invite.component';
import { AuthService } from '../../services/auth.service';
import { TeamService } from '../../services/team.service';

function memoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => void (store[k] = String(v)),
    removeItem: (k) => void delete store[k],
    clear: () => void (store = {}),
    key: (i) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

class FakeAuth {
  ready = Promise.resolve();
  loggedIn = true;
  whenReady() {
    return this.ready;
  }
  isLoggedIn() {
    return this.loggedIn;
  }
}

class FakeTeams {
  acceptInvite = vi.fn((_t: string) => of('t2'));
}

function setup(token: string | null, tune?: (a: FakeAuth, t: FakeTeams) => void) {
  const auth = new FakeAuth();
  const teams = new FakeTeams();
  tune?.(auth, teams);
  TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => token } } } },
      { provide: AuthService, useValue: auth },
      { provide: TeamService, useValue: teams },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(InviteComponent);
  const router = TestBed.inject(Router);
  return { fixture, comp: fixture.componentInstance, auth, teams, router };
}

describe('InviteComponent', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('accepts the invitation and lands on the board when signed in', async () => {
    const { fixture, teams, router } = setup('tok-1');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(teams.acceptInvite).toHaveBeenCalledWith('tok-1');
    expect(router.navigate).toHaveBeenCalledWith(['/board']);
  });

  it('maps a used-invitation error to its message key', async () => {
    const { fixture, comp } = setup('tok-1', (_a, t) => {
      t.acceptInvite = vi.fn(() => throwError(() => new Error('invitation_used')));
    });
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(comp['state']()).toBe('error');
    expect(comp['errorKey']()).toBe('invite.error.used');
  });

  it('stashes the token and bounces to /login when signed out', async () => {
    const { fixture, router } = setup('tok-9', (a) => (a.loggedIn = false));
    fixture.detectChanges();
    await Promise.resolve();

    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBe('tok-9');
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/invite/tok-9' },
    });
  });

  it('errors out when the route has no token', async () => {
    const { fixture, comp } = setup(null);
    fixture.detectChanges();
    await Promise.resolve();
    expect(comp['state']()).toBe('error');
  });

  it('clears a stashed token after a successful accept', async () => {
    localStorage.setItem(PENDING_INVITE_KEY, 'tok-1');
    const { fixture } = setup('tok-1');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });
});
