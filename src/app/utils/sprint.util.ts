import { I18nService } from '../services/i18n.service';
import { Lang } from '../i18n/translations';
import { daysLeft } from './due-date.util';

export type SprintHintTone = 'orange' | 'red';

/**
 * Sprint end-date hint for the sprint-selector trigger and the sprint-panel's
 * active-sprint row. Reuses `daysLeft()`'s day maths and the due-date colour
 * thresholds (0–3 days left → orange, overdue → red); `null` outside that
 * window or when there's no end date, per the Phase 1 precedent of no
 * persistent chrome for anything further out.
 */
export function sprintEndHint(
  endsOn: string | null | undefined,
  i18n: I18nService,
  now: Date = new Date(),
): { text: string; tone: SprintHintTone } | null {
  if (!endsOn) return null;
  const n = daysLeft(endsOn, now);

  if (n < 0) {
    const days = -n;
    const text =
      days === 2 && i18n.lang() === 'he'
        ? i18n.t('sprint.overdueDaysDual')
        : i18n.t('sprint.overdueDays').replace('{n}', String(days));
    return { text, tone: 'red' };
  }

  if (n <= 3) {
    let text: string;
    if (n === 0) text = i18n.t('sprint.endingToday');
    else if (n === 1) text = i18n.t('sprint.endingTomorrow');
    else if (n === 2 && i18n.lang() === 'he') text = i18n.t('sprint.endingInDaysDual');
    else text = i18n.t('sprint.endingInDays').replace('{n}', String(n));
    return { text, tone: 'orange' };
  }

  return null;
}

/**
 * Short localized date range for the sprint-panel row, e.g. "12 בפבר׳ – 2 במרץ".
 * One side missing renders an open-ended dash ("12 בפבר׳ –" / "– 2 במרץ");
 * `null` when neither is set (the caller shows `sprintPanel.row.noDates`).
 */
export function formatSprintRange(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
  lang: Lang,
): string | null {
  if (!startsOn && !endsOn) return null;
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(
      new Date(iso + 'T00:00:00'),
    );
  const start = startsOn ? fmt(startsOn) : '';
  const end = endsOn ? fmt(endsOn) : '';
  return `${start} – ${end}`.trim();
}
