import { RRule, rrulestr } from 'rrule';
import { addDays, format, parseISO } from 'date-fns';
import { getHolidayForDate } from '@/lib/holidays';
import { parseBusinessDayRule, nextNthBusinessDay, nthBusinessDayOfMonth } from '@/lib/businessDay';

/**
 * Detects "every weekday" rules (FREQ=WEEKLY with BYDAY=MO,TU,WE,TH,FR).
 * For these, occurrences that fall on a national holiday should be skipped.
 */
function isWeekdayOnlyRule(recurrenceRule: string): boolean {
  const upper = recurrenceRule.toUpperCase();
  if (!upper.includes('FREQ=WEEKLY')) return false;
  const byday = upper.match(/BYDAY=([A-Z,]+)/)?.[1];
  if (!byday) return false;
  const days = new Set(byday.split(','));
  return (
    days.size === 5 &&
    days.has('MO') && days.has('TU') && days.has('WE') && days.has('TH') && days.has('FR')
  );
}

/**
 * Parse a stored recurrence string. Supports a bare RRULE (e.g.
 * "FREQ=WEEKLY;BYDAY=FR") OR a full ICS block with EXDATE lines.
 */
function parseRecurrence(recurrenceRule: string, dtstart: Date) {
  const trimmed = recurrenceRule.trim();
  if (/\n/.test(trimmed) || /\bEXDATE[:;]/i.test(trimmed)) {
    let body = trimmed;
    if (!/\bDTSTART[:;]/i.test(body)) {
      const dt = format(dtstart, "yyyyMMdd'T'HHmmss");
      body = `DTSTART:${dt}\n${body}`;
    }
    return rrulestr(body, { forceset: true });
  }
  const ruleStr = trimmed.startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;
  const baseRule = RRule.fromString(ruleStr);
  return new RRule({ ...baseRule.origOptions, dtstart });
}

/**
 * Expand a recurrence rule between two dates (inclusive), anchored at the
 * task's current due date/time. Returns yyyy-MM-dd strings for each real
 * RRULE occurrence that falls in [rangeStart, rangeEnd].
 */
export function expandOccurrencesInRange(
  recurrenceRule: string | null | undefined,
  anchorDate: string,
  anchorTime: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
): string[] {
  if (!recurrenceRule || !anchorDate) return [];
  try {
    const anchor = parseISO(`${anchorDate}T${anchorTime || '00:00'}:00`);
    const rule = parseRecurrence(recurrenceRule, anchor);

    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);

    const lookupStart = anchor < start ? start : anchor;

    const occurrences = rule.between(lookupStart, end, true);
    const skipHolidays = isWeekdayOnlyRule(recurrenceRule);
    const dates = new Set<string>();
    for (const d of occurrences) {
      const key = format(d, 'yyyy-MM-dd');
      if (skipHolidays) {
        const h = getHolidayForDate(key);
        if (h?.type === 'national') continue;
      }
      dates.add(key);
    }
    return Array.from(dates);
  } catch (e) {
    console.error('expandOccurrencesInRange error', e);
    return [];
  }
}

/**
 * Add an EXDATE entry to a recurrence string. Returns a normalized
 * multi-line value containing DTSTART + RRULE + EXDATE(s). The exception
 * date must match the anchor's local time so rrule treats it as a real
 * occurrence to skip.
 */
export function addExdateToRecurrence(
  recurrenceRule: string,
  anchorDate: string,
  anchorTime: string | null | undefined,
  exceptionDate: string
): string {
  const time = anchorTime || '00:00';
  const dtstartLocal = parseISO(`${anchorDate}T${time}:00`);
  const exLocal = parseISO(`${exceptionDate}T${time}:00`);
  const fmt = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");

  const trimmed = recurrenceRule.trim();
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let dtstart: string | null = null;
  const exdates: string[] = [];
  let rrule: string | null = null;

  for (const line of lines) {
    if (/^DTSTART[:;]/i.test(line)) dtstart = line;
    else if (/^EXDATE[:;]/i.test(line)) exdates.push(line);
    else if (/^RRULE[:;]/i.test(line)) rrule = line;
    else if (/^[A-Z]+=/i.test(line)) rrule = `RRULE:${line}`;
  }

  if (!dtstart) dtstart = `DTSTART:${fmt(dtstartLocal)}`;
  if (!rrule) rrule = trimmed.startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;

  exdates.push(`EXDATE:${fmt(exLocal)}`);

  return [dtstart, rrule, ...exdates].join('\n');
}

export function addWeekdayExdatesToRecurrence(
  recurrenceRule: string,
  anchorDate: string,
  anchorTime: string | null | undefined,
  exceptionDate: string,
  rangeStart: string,
  rangeEnd: string
): string {
  let nextRule = recurrenceRule;
  const targetDay = parseISO(`${exceptionDate}T12:00:00`).getDay();
  let cursor = parseISO(`${rangeStart}T12:00:00`);
  const end = parseISO(`${rangeEnd}T12:00:00`);

  while (cursor <= end) {
    if (cursor.getDay() === targetDay) {
      nextRule = addExdateToRecurrence(nextRule, anchorDate, anchorTime, format(cursor, 'yyyy-MM-dd'));
    }
    cursor = addDays(cursor, 1);
  }

  return nextRule;
}

export function removeWeekdayFromRecurrence(
  recurrenceRule: string,
  anchorDate: string,
  exceptionDate: string
): string | null | undefined {
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const target = weekdayCodes[parseISO(`${exceptionDate}T12:00:00`).getDay()];
  const anchorWeekday = weekdayCodes[parseISO(`${anchorDate}T12:00:00`).getDay()];
  const lines = recurrenceRule.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rruleIndex = lines.findIndex((line) => /^RRULE[:;]/i.test(line) || /^[A-Z]+=/i.test(line));
  if (rruleIndex === -1) return undefined;

  const hasPrefix = /^RRULE[:;]/i.test(lines[rruleIndex]);
  const rawRule = lines[rruleIndex].replace(/^RRULE:/i, '');
  const params = new Map<string, string>();
  for (const part of rawRule.split(';')) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) params.set(key.toUpperCase(), value);
  }

  const freq = params.get('FREQ');
  if (freq === 'WEEKLY') {
    const currentDays = params.get('BYDAY')?.split(',').filter(Boolean) ?? [anchorWeekday];
    const nextDays = currentDays.filter((day) => day !== target);
    if (nextDays.length === currentDays.length) return undefined;
    if (nextDays.length === 0) return null;
    params.set('BYDAY', nextDays.join(','));
  } else if (freq === 'DAILY' && (!params.get('INTERVAL') || params.get('INTERVAL') === '1')) {
    params.set('FREQ', 'WEEKLY');
    params.set('BYDAY', weekdayCodes.filter((day) => day !== target).join(','));
  } else {
    return undefined;
  }

  const nextRule = Array.from(params.entries()).map(([key, value]) => `${key}=${value}`).join(';');
  lines[rruleIndex] = hasPrefix ? `RRULE:${nextRule}` : nextRule;
  return lines.join('\n');
}

/**
 * When the user edits "the whole series" and the new date/time differs,
 * the stored recurrence string may still contain a stale DTSTART (and
 * EXDATEs aligned to the old time). This produces ghost duplicates and
 * makes occurrence-coverage checks fail. Rewrite DTSTART to match the
 * new anchor and shift EXDATE times to the new HH:mm so they keep
 * matching real occurrences. Returns the recurrenceRule unchanged when
 * it is a bare RRULE without DTSTART/EXDATE.
 */
export function rewriteRecurrenceAnchor(
  recurrenceRule: string,
  newAnchorDate: string,
  newAnchorTime: string | null | undefined,
): string {
  const trimmed = recurrenceRule.trim();
  // Bare rule without DTSTART/EXDATE — nothing to rewrite.
  if (!/\bDTSTART[:;]/i.test(trimmed) && !/\bEXDATE[:;]/i.test(trimmed)) {
    return trimmed;
  }
  const time = newAnchorTime || '00:00';
  const newAnchorLocal = parseISO(`${newAnchorDate}T${time}:00`);
  const fmt = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");
  const newTimeStr = format(newAnchorLocal, "'T'HHmmss");

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let dtstartLine: string | null = null;
  let rruleLine: string | null = null;
  const exdates: string[] = [];

  for (const line of lines) {
    if (/^DTSTART[:;]/i.test(line)) dtstartLine = `DTSTART:${fmt(newAnchorLocal)}`;
    else if (/^EXDATE[:;]/i.test(line)) {
      // Replace the time portion of each EXDATE date with the new time,
      // preserving the original date so the exception still applies.
      const replaced = line.replace(/(\d{8})T\d{6}/g, (_m, day) => `${day}${newTimeStr}`);
      exdates.push(replaced);
    } else if (/^RRULE[:;]/i.test(line)) rruleLine = line;
    else if (/^[A-Z]+=/i.test(line)) rruleLine = `RRULE:${line}`;
  }

  if (!dtstartLine) dtstartLine = `DTSTART:${fmt(newAnchorLocal)}`;
  if (!rruleLine) rruleLine = trimmed.startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;

  return [dtstartLine, rruleLine, ...exdates].join('\n');
}

/**
 * Compute the next occurrence of a recurring task.
 * Returns yyyy-MM-dd | undefined and HH:mm | undefined if hour-anchored.
 * If the rule has terminated, returns null.
 */
export function nextOccurrence(
  recurrenceRule: string,
  currentDate?: string,
  currentTime?: string
): { dueDate: string; dueTime?: string } | null {
  if (!recurrenceRule) return null;
  try {
    let anchor: Date;
    if (currentDate) {
      anchor = parseISO(`${currentDate}T${currentTime || '00:00'}:00`);
    } else {
      anchor = new Date();
    }
    const rule = parseRecurrence(recurrenceRule, anchor);
    const next = rule.after(anchor, false);
    if (!next) return null;

    return {
      dueDate: format(next, 'yyyy-MM-dd'),
      dueTime: currentTime ? format(next, 'HH:mm') : undefined,
    };
  } catch (e) {
    console.error('nextOccurrence error', e);
    return null;
  }
}
