import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LanguageToggleComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  protected i18n = inject(I18nService);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = signal(false);
  /** Translation key for a failed sign-up — Supabase's raw message is mapped to
   *  a known key (see mapSignUpError) so nothing untranslated reaches the UI. */
  error = signal<string | null>(null);
  /** Set when email confirmation is on and the user must click a link first. */
  checkEmail = signal(false);
  showPassword = signal(false);

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    const { name, email, password } = this.form.getRawValue();
    const { data, error } = await this.authService.signUp(email!, password!, name!);
    this.loading.set(false);

    if (error) {
      this.error.set(mapSignUpError(error));
      return;
    }
    // Email confirmation off -> a session is returned and we can go straight in.
    if (data.session) {
      this.router.navigate(['/board']);
    } else {
      this.checkEmail.set(true);
    }
  }

  signInWithGoogle() {
    void this.authService.signInWithGoogle();
  }
}

/** Maps a Supabase auth error to a translation key so the UI never shows a raw,
 *  untranslated backend string. Falls back to the generic register.error. */
function mapSignUpError(error: { message?: string; code?: string }): string {
  const haystack = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase();

  if (haystack.includes('already registered') || haystack.includes('already exists')) {
    return 'register.error.exists';
  }
  if (haystack.includes('invalid') && haystack.includes('email')) {
    return 'register.error.invalidEmail';
  }
  if (haystack.includes('rate limit')) {
    return 'register.error.rateLimit';
  }
  if (haystack.includes('at least 6') || haystack.includes('password')) {
    return 'register.error.weakPassword';
  }
  return 'register.error';
}
