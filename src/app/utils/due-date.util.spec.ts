import {
  DueStatus,
  daysLeft,
  dueDateLong,
  dueLabel,
  dueStatus,
  isOverdue,
  startOfToday,
} from './due-date.util';
import { I18nService } from '../services/i18n.service';

// Fixed "now" — local noon, so there's a comfortable ±12h before the local
// calendar date flips regardless of the test runner's timezone.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

const p = (x: number) => String(x).padStart(2, '0');

/** `YYYY-MM-DD` for `n` whole days from NOW's local date (n<0 = past). */
const isoDate = (n: number): string => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Full ISO timestamp at local noon `n` days ago — round-trips to the intended
 *  local calendar day in any timezone. */
const tsDaysAgo = (n: number): string =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, 12, 0, 0).toISOString();

const fakeI18n = (lang: 'he' | 'en'): I18nService => {
  const he: Record<string, string> = {
    'due.today': 'היום',
    'due.tomorrow': 'מחר',
    'due.yesterday': 'אתמול',
    'due.inDays': 'בעוד {n} ימים',
    'due.overdueDays': 'באיחור של {n} ימים',
    'due.inDaysDual': 'בעוד יומיים',
    'due.overdueDaysDual': 'לפני יומיים',
  };
  const en: Record<string, string> = {
    'due.today': 'today',
    'due.tomorrow': 'tomorrow',
    'due.yesterday': 'yesterday',
    'due.inDays': 'in {n} days',
    'due.overdueDays': '{n} days overdue',
    'due.inDaysDual': 'in 2 days',
    'due.overdueDaysDual': '2 days overdue',
  };
  const table = lang === 'he' ? he : en;
  return { lang: () => lang, t: (k: string) => table[k] ?? k } as unknown as I18nService;
};

describe('due-date.util', () => {
  describe('startOfToday', () => {
    it('is local midnight of the given moment', () => {
      const m = startOfToday(NOW);
      expect([m.getHours(), m.getMinutes(), m.getSeconds()]).toEqual([0, 0, 0]);
      expect([m.getFullYear(), m.getMonth(), m.getDate()]).toEqual([2026, 5, 15]);
    });
  });

  describe('daysLeft', () => {
    it.each([
      [3, 3],
      [0, 0],
      [-5, -5],
      [1, 1],
      [-1, -1],
    ])('offset %i → %i', (offset, expected) => {
      expect(daysLeft(isoDate(offset), NOW)).toBe(expected);
    });
  });

  describe('isOverdue', () => {
    it.each([
      [-1, true],
      [-5, true],
      [0, false],
      [3, false],
    ])('offset %i → %s', (offset, expected) => {
      expect(isOverdue(isoDate(offset), NOW)).toBe(expected);
    });
  });

  describe('dueStatus', () => {
    const cases: Array<{ name: string; created: string; due: string | null; expected: DueStatus }> =
      [
        { name: 'no date → none', created: tsDaysAgo(10), due: null, expected: 'none' },
        { name: 'due today (0) → red', created: tsDaysAgo(30), due: isoDate(0), expected: 'red' },
        { name: 'overdue -1 → red', created: tsDaysAgo(30), due: isoDate(-1), expected: 'red' },
        { name: 'overdue -5 → red', created: tsDaysAgo(30), due: isoDate(-5), expected: 'red' },
        {
          name: 'exactly 3 days left → red',
          created: tsDaysAgo(30),
          due: isoDate(3),
          expected: 'red',
        },
        {
          name: 'exactly 7 days left → orange',
          created: tsDaysAgo(30),
          due: isoDate(7),
          expected: 'orange',
        },
        {
          name: 'short window (created 2d ago, due in 4) → orange via ≤7 cap',
          created: tsDaysAgo(2),
          due: isoDate(4),
          expected: 'orange',
        },
        {
          name: 'long window ~20% elapsed → green',
          created: tsDaysAgo(20),
          due: isoDate(80),
          expected: 'green',
        },
        {
          name: 'long window ~50% elapsed → yellow',
          created: tsDaysAgo(50),
          due: isoDate(50),
          expected: 'yellow',
        },
        {
          name: 'long window ~80% elapsed → orange',
          created: tsDaysAgo(80),
          due: isoDate(20),
          expected: 'orange',
        },
        {
          name: 'long window ~92% elapsed (remaining 8, past the ≤7 cap) → red',
          created: tsDaysAgo(92),
          due: isoDate(8),
          expected: 'red',
        },
      ];

    it.each(cases)('$name', ({ created, due, expected }) => {
      expect(dueStatus(created, due, NOW)).toBe(expected);
    });

    it('treats undefined dueDate as none', () => {
      expect(dueStatus(tsDaysAgo(5), undefined, NOW)).toBe('none');
    });

    // Exact-boundary cases the `<` comparisons hinge on. The window is 100 whole
    // days, so `ratio` = (days elapsed) / 100 lands precisely on each threshold.
    it.each([
      // elapsed / (elapsed + remaining) === threshold  →  bucket the `<` excludes
      { elapsed: 33, remaining: 67, ratio: '0.33', expected: 'yellow' as DueStatus },
      { elapsed: 66, remaining: 34, ratio: '0.66', expected: 'orange' as DueStatus },
      { elapsed: 90, remaining: 10, ratio: '0.90', expected: 'red' as DueStatus },
    ])('ratio exactly $ratio → $expected', ({ elapsed, remaining, expected }) => {
      expect(dueStatus(tsDaysAgo(elapsed), isoDate(remaining), NOW)).toBe(expected);
    });

    it('hits the span <= 0 guard when created is after due → red', () => {
      // due 20 days out (so left > 7 and the caps do not fire), created 25 days out.
      expect(dueStatus(tsDaysAgo(-25), isoDate(20), NOW)).toBe('red');
    });
  });

  describe('dueLabel', () => {
    it('today / tomorrow / yesterday (en)', () => {
      const i18n = fakeI18n('en');
      expect(dueLabel(isoDate(0), i18n, NOW)).toBe('today');
      expect(dueLabel(isoDate(1), i18n, NOW)).toBe('tomorrow');
      expect(dueLabel(isoDate(-1), i18n, NOW)).toBe('yesterday');
    });

    it('Hebrew dual form for ±2 days', () => {
      const i18n = fakeI18n('he');
      expect(dueLabel(isoDate(2), i18n, NOW)).toBe('בעוד יומיים');
      expect(dueLabel(isoDate(-2), i18n, NOW)).toBe('לפני יומיים');
    });

    it('English uses {n} interpolation for ±2 and beyond', () => {
      const i18n = fakeI18n('en');
      expect(dueLabel(isoDate(2), i18n, NOW)).toBe('in 2 days');
      expect(dueLabel(isoDate(-2), i18n, NOW)).toBe('2 days overdue');
      expect(dueLabel(isoDate(5), i18n, NOW)).toBe('in 5 days');
      expect(dueLabel(isoDate(-5), i18n, NOW)).toBe('5 days overdue');
    });

    it('Hebrew {n} interpolation for counts other than ±2', () => {
      const i18n = fakeI18n('he');
      expect(dueLabel(isoDate(5), i18n, NOW)).toBe('בעוד 5 ימים');
      expect(dueLabel(isoDate(-4), i18n, NOW)).toBe('באיחור של 4 ימים');
    });
  });

  describe('dueDateLong', () => {
    it('formats a long localized date', () => {
      expect(dueDateLong('2026-09-09', 'en')).toBe('September 9, 2026');
      // he output varies by ICU build; just assert it produced a dated string.
      const he = dueDateLong('2026-09-09', 'he');
      expect(he).toContain('2026');
      expect(he).toContain('9');
    });
  });
});
