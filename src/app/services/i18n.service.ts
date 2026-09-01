import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Lang, TRANSLATIONS } from '../i18n/translations';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly KEY = 'stack_lang';
  private doc = inject(DOCUMENT);

  /** Current UI language. Read it in templates (directly or via t()) so OnPush
   *  components re-render when it changes. */
  lang = signal<Lang>('he');

  constructor() {
    const saved = this.read();
    this.apply(saved === 'en' || saved === 'he' ? saved : 'he');
  }

  setLang(lang: Lang): void {
    this.apply(lang);
  }

  toggle(): void {
    this.apply(this.lang() === 'he' ? 'en' : 'he');
  }

  isRtl(): boolean {
    return this.lang() === 'he';
  }

  /** Translate a dotted key for the active language.
   *  Reads the `lang` signal, so calling this from a template ties the binding
   *  to language changes. Unknown keys return the key itself. */
  t(key: string): string {
    return TRANSLATIONS[this.lang()][key] ?? key;
  }

  private apply(lang: Lang): void {
    this.lang.set(lang);
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const el = this.doc.documentElement;
    el.setAttribute('lang', lang);
    el.setAttribute('dir', dir);
    this.write(lang);
  }

  // localStorage can be absent or throw (private-mode Safari, blocked cookies,
  // some test environments) — never let persistence break language switching.
  private read(): string | null {
    try {
      return localStorage.getItem(this.KEY);
    } catch {
      return null;
    }
  }

  private write(lang: Lang): void {
    try {
      localStorage.setItem(this.KEY, lang);
    } catch {
      /* ignore */
    }
  }
}
