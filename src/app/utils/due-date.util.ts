import { I18nService } from '../services/i18n.service';
import { Lang } from '../i18n/translations';

/**
 * Due-date maths + labels. All day arithmetic is done in **local** time so
 * "today" / "overdue" line up with the user's wall clock. The colour bucket
 * functions (`dueStatus`, `daysLeft`, `isOverdue`, `startOfToday`) take only
 * dates and stay free of `I18nService` so they unit-test in isolation;
 * `dueLabel` is the one that needs the translation service.
 */

export type DueStatus = 'none' | 'green' | 'yellow' | 'orange' | 'red';

const MS_PER_DAY = 86_400_000;

/** Local midnight (00:00:00 local) for the given moment. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Parse an ISO `YYYY-MM-DD` string to local midnight. */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Whole days from local today to the due date (also floored to local midnight).
 * `0` = due today, negative = overdue. `Math.round` so a DST transition inside
 * the range can't push the count off by one.
 */
export function daysLeft(dueDate: string, now: Date = new Date()): number {
  const today = startOfToday(now).getTime();
  const due = parseLocalDate(dueDate).getTime();
  return Math.round((due - today) / MS_PER_DAY);
}

export function isOverdue(dueDate: string, now: Date = new Date()): boolean {
  return daysLeft(dueDate, now) < 0;
}

/**
 * Colour bucket for a due date:
 * - no date → `'none'`
 * - `daysLeft <= 3` (today + overdue included) → `'red'`
 * - `daysLeft <= 7` → `'orange'`
 * - otherwise proportional over the created→due window.
 */
export function dueStatus(
  createdAt: string,
  dueDate: string | null | undefined,
  now: Date = new Date(),
): DueStatus {
  if (!dueDate) return 'none';

  const left = daysLeft(dueDate, now);
  if (left <= 3) return 'red';
  if (left <= 7) return 'orange';

  const created = startOfToday(new Date(createdAt)).getTime();
  const due = parseLocalDate(dueDate).getTime();
  // created on/after due — the caps above have already returned, but guard the
  // divide-by-zero all the same.
  if (due - created <= 0) return 'red';

  // Whole-day counts on both sides (Math.round absorbs any DST hour), so the
  // ratio is a clean day fraction that doesn't drift across a threshold as the
  // day advances or as clocks change.
  const spanDays = Math.round((due - created) / MS_PER_DAY);
  const elapsedDays = Math.round((startOfToday(now).getTime() - created) / MS_PER_DAY);
  const ratio = clamp(elapsedDays / spanDays, 0, 1);
  if (ratio < 0.33) return 'green';
  if (ratio < 0.66) return 'yellow';
  if (ratio < 0.9) return 'orange';
  return 'red';
}

/**
 * Human label for a due date. Interpolates `{n}` with a plain `.replace` —
 * this repo has no ICU helper. Hebrew has a dedicated dual form ("יומיים")
 * for ±2 days; every other language / count uses the `{n}` keys.
 */
export function dueLabel(dueDate: string, i18n: I18nService, now: Date = new Date()): string {
  const n = daysLeft(dueDate, now);
  if (n === 0) return i18n.t('due.today');
  if (n === 1) return i18n.t('due.tomorrow');
  if (n === -1) return i18n.t('due.yesterday');
  if (n === 2 && i18n.lang() === 'he') return i18n.t('due.inDaysDual');
  if (n === -2 && i18n.lang() === 'he') return i18n.t('due.overdueDaysDual');
  if (n > 1) return i18n.t('due.inDays').replace('{n}', String(n));
  return i18n.t('due.overdueDays').replace('{n}', String(-n));
}

/** Long, localized date for the badge `title` / aria-label, e.g. "9 בספטמבר 2026". */
export function dueDateLong(dueDate: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dueDate + 'T00:00:00'));
}
