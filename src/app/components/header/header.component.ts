import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { I18nService } from '../../services/i18n.service';
import { LanguageToggleComponent } from '../language-toggle/language-toggle.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [LanguageToggleComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  @Input() taskCount = 0;
  @Output() addTask = new EventEmitter<void>();

  private authService = inject(AuthService);
  private router = inject(Router);
  protected themeService = inject(ThemeService);
  protected i18n = inject(I18nService);

  get userInitials(): string {
    const user = this.authService.getCurrentUser();
    if (!user) return '';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
