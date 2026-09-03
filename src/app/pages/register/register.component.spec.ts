import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../services/auth.service';

class FakeAuth {
  signUp = vi.fn(async () => ({
    data: { session: null },
    error: { message: 'User already registered' } as { message?: string; code?: string } | null,
  }));
  signInWithGoogle = vi.fn();
}

function mount(auth: FakeAuth) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(RegisterComponent);
  fixture.detectChanges();
  const comp = fixture.componentInstance;
  comp.form.setValue({ name: 'Ada', email: 'ada@example.com', password: 'secret1' });
  return comp;
}

describe('RegisterComponent', () => {
  it('maps a known Supabase sign-up error to its translation key', async () => {
    const auth = new FakeAuth();
    const comp = mount(auth);

    await comp.submit();

    expect(comp.error()).toBe('register.error.exists');
  });

  it('maps a weak-password error to its translation key', async () => {
    const auth = new FakeAuth();
    auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    const comp = mount(auth);

    await comp.submit();

    expect(comp.error()).toBe('register.error.weakPassword');
  });

  it('falls back to the generic key for an unrecognised error', async () => {
    const auth = new FakeAuth();
    auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'totally unexpected failure' },
    });
    const comp = mount(auth);

    await comp.submit();

    expect(comp.error()).toBe('register.error');
  });
});
