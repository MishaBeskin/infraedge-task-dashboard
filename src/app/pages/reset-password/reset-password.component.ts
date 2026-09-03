import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle.component';

/**
 * Reached from a password-recovery email. Supabase has already put a temporary
 * session in place by the time the user lands here, so updateUser({ password })
 * is all that's needed.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LanguageToggleComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  protected i18n = inject(I18nService);

  form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = signal(false);
  error = signal<string | null>(null);
  showPassword = signal(false);
  /** True once the recovery session is confirmed present. Until then submit is
   *  blocked so updatePassword() can't fire without a session behind it. */
  sessionReady = signal(false);

  constructor() {
    this.authService.whenReady().then(() => {
      this.sessionReady.set(this.authService.isLoggedIn());
      if (!this.authService.isLoggedIn()) {
        this.error.set('reset.error');
      }
    });
  }

  togglePassword() {
    this.showPassword.update((v) => !v);
  }

  async submit() {
    if (!this.sessionReady()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    const { error } = await this.authService.updatePassword(this.form.controls.password.value!);
    this.loading.set(false);

    if (error) {
      this.error.set('reset.error');
      return;
    }
    this.router.navigate(['/board']);
  }
}
