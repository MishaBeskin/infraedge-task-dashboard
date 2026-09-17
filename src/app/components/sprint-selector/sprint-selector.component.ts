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
import { Sprint, SprintStatus } from '../../models/sprint.model';
import { sprintEndHint, SprintHintTone } from '../../utils/sprint.util';

export type SprintFilterValue = 'all' | 'backlog' | string;

/**
 * Toolbar sprint filter. Trigger + dropdown mechanics copied from
 * `TeamSwitcherComponent` (open/close, roving arrow-key focus, click-outside
 * and Escape close, `role="menu"` / `menuitemradio` rows) — see that file for
 * the canonical version of this interaction, kept as a local copy the same
 * way `team-switcher` itself copied `user-menu`.
 */
@Component({
  selector: 'app-sprint-selector',
  standalone: true,
  imports: [],
  templateUrl: './sprint-selector.component.html',
  styleUrl: './sprint-selector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SprintSelectorComponent {
  @Input() sprints: Sprint[] = [];
  @Input() selected: SprintFilterValue = 'all';
  @Output() select = new EventEmitter<SprintFilterValue>();
  /** Asks the board to open the sprint-management dialog. */
  @Output() manage = new EventEmitter<void>();

  protected i18n = inject(I18nService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected get orderedSprints(): Sprint[] {
    return [...this.sprints].sort((a, b) => a.position - b.position);
  }

  protected get selectedSprint(): Sprint | null {
    return this.sprints.find((s) => s.id === this.selected) ?? null;
  }

  protected get triggerLabel(): string {
    if (this.selected === 'all') return this.i18n.t('board.sprint.all');
    if (this.selected === 'backlog') return this.i18n.t('board.sprint.backlog');
    return this.selectedSprint?.name ?? this.i18n.t('board.sprint.all');
  }

  /** Second trigger line — only for the currently selected sprint when it's
   *  the active one and its end date is within the hint window. */
  protected get triggerHint(): { text: string; tone: SprintHintTone } | null {
    const sprint = this.selectedSprint;
    if (!sprint || sprint.status !== 'active') return null;
    return sprintEndHint(sprint.endsOn, this.i18n);
  }

  protected get manageLabel(): string {
    return this.sprints.length
      ? this.i18n.t('board.sprint.manage')
      : this.i18n.t('board.sprint.manage.first');
  }

  statusLabel(status: SprintStatus): string {
    return this.i18n.t(`sprint.status.${status}`);
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

  selectValue(value: SprintFilterValue): void {
    if (value !== this.selected) this.select.emit(value);
    this.close(true);
  }

  openManage(): void {
    this.close();
    this.manage.emit();
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
