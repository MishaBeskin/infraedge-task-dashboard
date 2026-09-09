import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  inject,
  signal,
  computed,
  effect,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { I18nService } from '../../services/i18n.service';
import { Team } from '../../models/team.model';
import { UserMenuComponent } from '../user-menu/user-menu.component';
import { TeamSwitcherComponent } from '../team-switcher/team-switcher.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [UserMenuComponent, TeamSwitcherComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  @Input() taskCount = 0;
  /** Board name == active team name; `null` while teams load. */
  @Input() boardName: string | null = null;
  /** Only a team owner may rename the board. */
  @Input() canRename = false;
  @Input() teams: Team[] = [];
  @Input() activeTeamId: string | null = null;

  @Output() renameBoard = new EventEmitter<string>();
  @Output() switchTeam = new EventEmitter<string>();
  @Output() openCreateTeam = new EventEmitter<void>();
  @Output() openTeamPanel = new EventEmitter<void>();

  protected i18n = inject(I18nService);

  /** true while the inline title editor is open. */
  protected readonly editing = signal(false);
  /** Working copy of the title while editing. */
  protected readonly draft = signal('');
  /** Input width tracks the draft length so the field doesn't jump. */
  protected readonly draftWidthCh = computed(() => Math.max(this.draft().length, 6) + 2);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly titleButton = viewChild<ElementRef<HTMLButtonElement>>('titleButton');

  constructor() {
    // Focus + select the field as soon as it renders (signal viewChild updates
    // once the @if branch is in the DOM, which re-runs this effect).
    effect(() => {
      if (this.editing()) {
        const el = this.titleInput()?.nativeElement;
        if (el) {
          el.focus();
          el.select();
        }
      }
    });
  }

  /** The title actually shown: team name, or the localized default. */
  get displayTitle(): string {
    return this.boardName ?? this.i18n.t('header.title');
  }

  startEdit(): void {
    if (!this.canRename) return;
    this.draft.set(this.displayTitle);
    this.editing.set(true);
  }

  /** Enter or blur. Emits only when the trimmed value differs from what's shown. */
  commit(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    const next = this.draft().trim();
    if (next !== this.displayTitle) {
      this.renameBoard.emit(next);
    }
  }

  /** Escape. Discards the draft and returns focus to the trigger button. */
  cancel(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    setTimeout(() => this.titleButton()?.nativeElement.focus(), 0);
  }
}
