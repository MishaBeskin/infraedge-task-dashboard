import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'stack_theme';
  private doc = inject(DOCUMENT);

  isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem(this.KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved ? saved === 'dark' : prefersDark);
  }

  toggle(): void {
    this.apply(!this.isDark());
  }

  private apply(dark: boolean): void {
    this.isDark.set(dark);
    this.doc.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem(this.KEY, dark ? 'dark' : 'light');
  }
}
