import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthCallbackComponent } from './auth-callback.component';
import { AuthService } from '../../services/auth.service';

class FakeAuth {
  currentUser$ = new Subject<unknown>();
  loggedIn = false;
  ready: Promise<void> = Promise.resolve();
  whenReady() {
    return this.ready;
  }
  isLoggedIn() {
    return this.loggedIn;
  }
}

describe('AuthCallbackComponent', () => {
  let auth: FakeAuth;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    auth = new FakeAuth();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('fails fast when the hash carries an OAuth error', () => {
    window.location.hash = '#error=access_denied&error_description=nope';
    const fixture = TestBed.createComponent(AuthCallbackComponent);
    expect(fixture.componentInstance.failed()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes to /reset-password only once the recovery session is ready', async () => {
    window.location.hash = '#access_token=abc&type=recovery';
    let release!: () => void;
    auth.ready = new Promise<void>((r) => (release = r));
    auth.loggedIn = true;

    const fixture = TestBed.createComponent(AuthCallbackComponent);
    expect(navigate).not.toHaveBeenCalled();

    release();
    await auth.ready;
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith(['/reset-password'], { preserveFragment: true });
    expect(fixture.componentInstance.failed()).toBe(false);
  });

  it('fails when a recovery link lands without a session', async () => {
    window.location.hash = '#type=recovery';
    auth.loggedIn = false;

    const fixture = TestBed.createComponent(AuthCallbackComponent);
    await auth.ready;
    await Promise.resolve();

    expect(fixture.componentInstance.failed()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('fails when the sign-in wait times out', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      window.location.hash = '';
      const fixture = TestBed.createComponent(AuthCallbackComponent);

      vi.advanceTimersByTime(6001);

      expect(fixture.componentInstance.failed()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
