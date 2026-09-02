import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LanguageToggleComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  protected i18n = inject(I18nService);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading = signal(false);
  /** Translation key for the current error, or null. */
  error = signal<string | null>(null);
  /** Translation key for a non-error notice (magic link / reset email sent). */
  notice = signal<string | null>(null);
  showPassword = signal(false);

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.error()) this.error.set(null);
    });
  }

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
    this.notice.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.authService.signInWithPassword(email!, password!);
    this.loading.set(false);

    if (error) {
      this.error.set('login.error');
      return;
    }
    this.router.navigate(['/board']);
  }

  async sendMagicLink() {
    if (!this.requireEmail()) return;
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    const { error } = await this.authService.signInWithMagicLink(this.form.controls.email.value!);
    this.loading.set(false);
    if (error) this.error.set('auth.error.generic');
    else this.notice.set('auth.magicLink.sent');
  }

  async forgotPassword() {
    if (!this.requireEmail()) return;
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    const { error } = await this.authService.sendPasswordReset(this.form.controls.email.value!);
    this.loading.set(false);
    if (error) this.error.set('auth.error.generic');
    else this.notice.set('auth.reset.sent');
  }

  signInWithGoogle() {
    void this.authService.signInWithGoogle();
  }

  private requireEmail(): boolean {
    const email = this.form.controls.email;
    if (email.invalid) {
      email.markAsTouched();
      return false;
    }
    return true;
  }
}
