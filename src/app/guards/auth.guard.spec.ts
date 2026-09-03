import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

const noRoute = {} as ActivatedRouteSnapshot;
const noState = {} as RouterStateSnapshot;

function runGuard() {
  return Promise.resolve(TestBed.runInInjectionContext(() => authGuard(noRoute, noState)));
}

describe('authGuard', () => {
  let loggedIn: boolean;
  let ready: Promise<void>;

  beforeEach(() => {
    loggedIn = false;
    ready = Promise.resolve();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            whenReady: () => ready,
            isLoggedIn: () => loggedIn,
          },
        },
      ],
    });
  });

  it('allows activation when the user is logged in', async () => {
    loggedIn = true;
    expect(await runGuard()).toBe(true);
  });

  it('redirects to /login when the user is not logged in', async () => {
    loggedIn = false;
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(String(result)).toBe('/login');
  });

  it('waits for whenReady() to resolve before deciding', async () => {
    let release!: () => void;
    ready = new Promise<void>((r) => (release = r));
    loggedIn = true;

    let settled = false;
    const pending = runGuard().then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    expect(await pending).toBe(true);
  });
});
