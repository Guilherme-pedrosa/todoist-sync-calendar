import { RRule } from 'rrule';
import { format, parseISO } from 'date-fns';

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

    // Find the next occurrence strictly after anchor
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
