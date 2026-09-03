import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'stack_theme';
  private doc = inject(DOCUMENT);

  isDark = signal(false);

  constructor() {
    const saved = this.read();
    this.apply(saved ? saved === 'dark' : this.prefersDark());
  }

  toggle(): void {
    this.apply(!this.isDark());
  }

  private apply(dark: boolean): void {
    this.isDark.set(dark);
    this.doc.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.write(dark);
  }

  // localStorage / matchMedia can be absent or throw (private-mode Safari,
  // blocked cookies, SSR, some test environments) — never let persistence or
  // the OS preference probe break construction or theme switching.
  private read(): string | null {
    try {
      return localStorage.getItem(this.KEY);
    } catch {
      return null;
    }
  }

  private write(dark: boolean): void {
    try {
      localStorage.setItem(this.KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  private prefersDark(): boolean {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  }
}
