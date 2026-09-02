import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

type AuthCb = (event: string, session: unknown) => void;

/** Fake of supabase.auth — records calls and lets tests drive the auth state. */
class FakeAuth {
  private cb: AuthCb = () => {};
  session: { user: Record<string, unknown> } | null = null;

  signInWithPassword = vi.fn(async () => ({ data: {}, error: null as unknown }));
  signUp = vi.fn(async () => ({ data: { session: null }, error: null as unknown }));
  signInWithOtp = vi.fn(async () => ({ data: {}, error: null as unknown }));
  signInWithOAuth = vi.fn(async () => ({ data: {}, error: null as unknown }));
  resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null as unknown }));
  updateUser = vi.fn(async () => ({ data: {}, error: null as unknown }));
  signOut = vi.fn(async () => ({ error: null as unknown }));

  async getSession() {
    return { data: { session: this.session }, error: null };
  }

  onAuthStateChange(cb: AuthCb) {
    this.cb = cb;
    return { data: { subscription: { unsubscribe() {} } } };
  }

  /** Test helper: simulate Supabase emitting a new session (or null). */
  emit(session: { user: Record<string, unknown> } | null) {
    this.session = session;
    this.cb('CHANGED', session);
  }
}

const userWith = (over: Record<string, unknown>) => ({
  id: 'uid-1',
  email: 'alice@example.com',
  user_metadata: {},
  ...over,
});

function setup(initialSession: { user: Record<string, unknown> } | null = null) {
  const auth = new FakeAuth();
  auth.session = initialSession;
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { auth } } }],
  });
  const service = TestBed.inject(AuthService);
  return { auth, service };
}

describe('AuthService', () => {
  it('is created', () => {
    const { service } = setup();
    expect(service).toBeTruthy();
  });

  it('starts logged out when there is no stored session', async () => {
    const { service } = setup(null);
    await service.whenReady();
    expect(service.getCurrentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('restores the user from a stored session on init', async () => {
    const { service } = setup({ user: userWith({ user_metadata: { name: 'Alice Johnson' } }) });
    await service.whenReady();

    expect(service.isLoggedIn()).toBe(true);
    expect(service.getCurrentUser()).toEqual({
      id: 'uid-1',
      email: 'alice@example.com',
      name: 'Alice Johnson',
    });
  });

  it('derives the name from full_name, then email local-part', async () => {
    const { service, auth } = setup(null);
    await service.whenReady();

    auth.emit({ user: userWith({ user_metadata: { full_name: 'Bob Smith' } }) });
    expect(service.getCurrentUser()?.name).toBe('Bob Smith');

    auth.emit({ user: userWith({ email: 'carol@example.com', user_metadata: {} }) });
    expect(service.getCurrentUser()?.name).toBe('carol');
  });

  it('updates currentUser$ when the auth state changes', async () => {
    const { service, auth } = setup(null);
    await service.whenReady();

    auth.emit({ user: userWith({ user_metadata: { name: 'Alice' } }) });
    expect(await firstValueFrom(service.currentUser$)).toMatchObject({ name: 'Alice' });

    auth.emit(null);
    expect(await firstValueFrom(service.currentUser$)).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('delegates sign-in to supabase', async () => {
    const { service, auth } = setup();
    await service.signInWithPassword('alice@example.com', 'pw');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'pw',
    });
  });

  it('passes the display name as metadata on sign-up', async () => {
    const { service, auth } = setup();
    await service.signUp('new@example.com', 'pw', 'New User');
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        password: 'pw',
        options: expect.objectContaining({ data: { name: 'New User' } }),
      }),
    );
  });

  it('requests a magic link with user creation enabled', async () => {
    const { service, auth } = setup();
    await service.signInWithMagicLink('x@example.com');
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'x@example.com',
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });

  it('starts the Google OAuth flow', async () => {
    const { service, auth } = setup();
    await service.signInWithGoogle();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    );
  });

  it('signs out via supabase', async () => {
    const { service, auth } = setup();
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
