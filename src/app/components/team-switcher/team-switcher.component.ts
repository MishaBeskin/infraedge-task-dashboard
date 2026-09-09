import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { I18nService } from '../../services/i18n.service';
import { Team } from '../../models/team.model';

/**
 * Caret button that sits inside `<h1 class="board-title">` and opens a menu to
 * switch teams / request the "new team" dialog (the dialog itself lives on the
 * board). Open/close + roving-focus + Esc-refocus + click-outside logic is
 * copied from `user-menu.component.ts` (kept as a local copy — same choice the
 * user-menu made, low churn).
 */
@Component({
  selector: 'app-team-switcher',
  standalone: true,
  imports: [],
  templateUrl: './team-switcher.component.html',
  styleUrl: './team-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSwitcherComponent {
  @Input() teams: Team[] = [];
  @Input() activeTeamId: string | null = null;
  @Output() switchTeam = new EventEmitter<string>();
  /** Asks the board to open the new-team dialog. */
  @Output() openCreate = new EventEmitter<void>();

  protected i18n = inject(I18nService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  roleLabel(role: Team['role']): string {
    return this.i18n.t(role === 'owner' ? 'team.role.owner' : 'team.role.member');
  }

  toggle(): void {
    this.open() ? this.close() : this.openMenu();
  }

  private openMenu(): void {
    this.open.set(true);
    setTimeout(() => this.firstItem()?.focus(), 0);
  }

  close(focusTrigger = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (focusTrigger) this.trigger()?.nativeElement.focus();
  }

  select(id: string): void {
    if (id !== this.activeTeamId) this.switchTeam.emit(id);
    this.close(true);
  }

  requestCreate(): void {
    this.close();
    this.openCreate.emit();
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

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = this.items();
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(current + delta + items.length) % items.length].focus();
  }

  private items(): HTMLElement[] {
    const root = this.panel()?.nativeElement;
    return root ? Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]')) : [];
  }

  private firstItem(): HTMLElement | undefined {
    return this.items()[0];
  }
}
