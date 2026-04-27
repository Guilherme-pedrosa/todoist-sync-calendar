import { RRule } from 'rrule';
import { format, parseISO } from 'date-fns';

/**
 * Expand a recurrence rule between two dates (inclusive), anchored at the
 * task's current due date/time. Returns yyyy-MM-dd strings for each occurrence
 * that falls in [rangeStart, rangeEnd]. The anchor itself is included if it
 * lies in the range.
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
    const ruleStr = recurrenceRule.startsWith('RRULE:')
      ? recurrenceRule
      : `RRULE:${recurrenceRule}`;
    const baseRule = RRule.fromString(ruleStr);
    const anchor = parseISO(`${anchorDate}T${anchorTime || '00:00'}:00`);
    const anchoredRule = new RRule({ ...baseRule.origOptions, dtstart: anchor });

    // Normalize range to whole days (inclusive end-of-day)
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);

    // If anchor is after the range, no occurrences to render here.
    // If anchor is before range start, use range start.
    const lookupStart = anchor < start ? start : anchor;

    const occurrences = anchoredRule.between(lookupStart, end, true);
    // Always include the anchor itself if it's in range (rrule.between excludes
    // dtstart in some configs).
    const dates = new Set<string>();
    if (anchor >= start && anchor <= end) {
      dates.add(format(anchor, 'yyyy-MM-dd'));
    }
    for (const d of occurrences) dates.add(format(d, 'yyyy-MM-dd'));
    return Array.from(dates);
  } catch (e) {
    console.error('expandOccurrencesInRange error', e);
    return [];
  }
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
    const ruleStr = recurrenceRule.startsWith('RRULE:')
      ? recurrenceRule
      : `RRULE:${recurrenceRule}`;
    const rule = RRule.fromString(ruleStr);

    // Anchor: prefer current due, else now
    let anchor: Date;
    if (currentDate) {
      anchor = parseISO(`${currentDate}T${currentTime || '00:00'}:00`);
    } else {
      anchor = new Date();
    }

    // RRULEs saved without DTSTART otherwise start at "now", which can make
    // same-day recurrences stay on the same day. Anchor the rule on the task's
    // current due date/time, then find the next occurrence after it.
    const anchoredRule = new RRule({ ...rule.origOptions, dtstart: anchor });
    const next = anchoredRule.after(anchor, false);
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
