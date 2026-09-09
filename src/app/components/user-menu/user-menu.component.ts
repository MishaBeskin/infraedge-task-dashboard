import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { I18nService } from '../../services/i18n.service';
import { Lang } from '../../i18n/translations';
import { AppUser } from '../../models/task.model';

/**
 * ChatGPT-style account menu: the avatar + name button opens a dropdown holding
 * the language toggle, theme toggle and log-out that used to sit loose in the
 * header bar.
 *
 * Open/close: click the trigger to toggle; the panel also closes on an outside
 * click, on Escape (focus returns to the trigger) and after Log out. Choosing a
 * language or theme keeps the panel open so the change is visible in place.
 */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected themeService = inject(ThemeService);
  protected i18n = inject(I18nService);

  /** Opens the team management panel (built in Pass B). */
  @Output() openTeamPanel = new EventEmitter<void>();

  protected readonly open = signal(false);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  get user(): AppUser | null {
    return this.authService.getCurrentUser();
  }

  get userInitials(): string {
    const user = this.user;
    if (!user) return '';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  toggle(): void {
    this.open() ? this.close() : this.openMenu();
  }

  private openMenu(): void {
    this.open.set(true);
    // Move focus into the panel once it has rendered.
    setTimeout(() => this.firstItem()?.focus(), 0);
  }

  close(focusTrigger = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (focusTrigger) this.trigger()?.nativeElement.focus();
  }

  selectLang(lang: Lang): void {
    this.i18n.setLang(lang);
  }

  selectTheme(dark: boolean): void {
    this.themeService.set(dark);
  }

  manageTeam(): void {
    this.close();
    this.openTeamPanel.emit();
  }

  async logout(): Promise<void> {
    this.close();
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close(true);
  }

  /** Roving focus between menu items with the arrow keys. */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = this.items();
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + delta + items.length) % items.length;
    items[next].focus();
  }

  private items(): HTMLElement[] {
    const root = this.panel()?.nativeElement;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  }

  private firstItem(): HTMLElement | undefined {
    return this.items()[0];
  }
}
