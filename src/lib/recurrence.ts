import { RRule, rrulestr } from 'rrule';
import { addDays, format, parseISO } from 'date-fns';

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
    const dates = new Set<string>();
    for (const d of occurrences) dates.add(format(d, 'yyyy-MM-dd'));
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
): string | null {
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const target = weekdayCodes[parseISO(`${exceptionDate}T12:00:00`).getDay()];
  const anchorWeekday = weekdayCodes[parseISO(`${anchorDate}T12:00:00`).getDay()];
  const lines = recurrenceRule.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rruleIndex = lines.findIndex((line) => /^RRULE[:;]/i.test(line) || /^[A-Z]+=/i.test(line));
  if (rruleIndex === -1) return recurrenceRule;

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
    if (nextDays.length === currentDays.length) return recurrenceRule;
    if (nextDays.length === 0) return null;
    params.set('BYDAY', nextDays.join(','));
  } else if (freq === 'DAILY' && (!params.get('INTERVAL') || params.get('INTERVAL') === '1')) {
    params.set('FREQ', 'WEEKLY');
    params.set('BYDAY', weekdayCodes.filter((day) => day !== target).join(','));
  } else {
    return recurrenceRule;
  }

  const nextRule = Array.from(params.entries()).map(([key, value]) => `${key}=${value}`).join(';');
  lines[rruleIndex] = hasPrefix ? `RRULE:${nextRule}` : nextRule;
  return lines.join('\n');
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
