import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  imports: [],
  templateUrl: './language-toggle.component.html',
  styleUrl: './language-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageToggleComponent {
  protected i18n = inject(I18nService);
}
