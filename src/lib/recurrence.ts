import { RRule, rrulestr } from 'rrule';
import { addDays, format, parseISO } from 'date-fns';
import { getHolidayForDate } from '@/lib/holidays';
import { parseBusinessDayRule, nextNthBusinessDay, nthBusinessDayOfMonth } from '@/lib/businessDay';

/**
 * CONVENÇÃO DE DATAS DESTE MÓDULO — leia antes de mexer.
 *
 * O rrule.js faz TODA a matemática de recorrência nos campos UTC dos Dates, e
 * o parser de strings ICS (rrulestr) interpreta datas "naive" tipo
 * `DTSTART:20260901T130000` como UTC. Se entrarmos com Dates locais
 * (parseISO/new Date) e formatarmos a saída com date-fns local, cada
 * conversão desloca o horário pelo offset do fuso (-3h em Brasília) — foi o
 * bug que fazia o almoço de 13:00 virar 10:00 e depois 07:00.
 *
 * Regra deste arquivo: todo Date que ENTRA no rrule é construído com
 * Date.UTC(...) a partir dos componentes de parede (wall clock), e todo Date
 * que SAI do rrule é lido com getUTC*(). Nenhum Date local atravessa a
 * fronteira do rrule, em nenhuma direção. Assim as strings naive gravadas no
 * banco (T130000 = 13:00 de parede) significam sempre o horário que o
 * usuário escolheu, em qualquer fuso e sem migração.
 */

/** Data/hora de parede (yyyy-MM-dd + HH:mm) → Date na convenção do rrule. */
function wallToRRuleDate(dateStr: string, timeStr?: string | null): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh = 0, mm = 0] = (timeStr || '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
}

/** Date vindo do rrule → strings de parede { date: yyyy-MM-dd, time: HH:mm }. */
function rruleDateToWall(d: Date): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

/** Date na convenção do rrule → string ICS naive yyyyMMdd'T'HHmmss. */
function rruleDateToIcs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** "Agora" da parede local convertido para a convenção do rrule. */
function nowAsRRuleDate(): Date {
  const n = new Date();
  return new Date(
    Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds())
  );
}

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
 * `dtstart` must already be in the rrule convention (wallToRRuleDate).
 */
function parseRecurrence(recurrenceRule: string, dtstart: Date) {
  const trimmed = recurrenceRule.trim();
  if (/\n/.test(trimmed) || /\bEXDATE[:;]/i.test(trimmed)) {
    let body = trimmed;
    if (!/\bDTSTART[:;]/i.test(body)) {
      body = `DTSTART:${rruleDateToIcs(dtstart)}\n${body}`;
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
 * `rangeStart`/`rangeEnd` are ordinary local Dates (as the pages produce);
 * only their local calendar day is used.
 */
export function expandOccurrencesInRange(
  recurrenceRule: string | null | undefined,
  anchorDate: string,
  anchorTime: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date
): string[] {
  if (!recurrenceRule || !anchorDate) return [];

  // Caso especial: regra "N-ésimo dia útil do mês"
  const bd = parseBusinessDayRule(recurrenceRule);
  if (bd) {
    const dates = new Set<string>();
    const startKey = format(rangeStart, 'yyyy-MM-dd');
    const endKey = format(rangeEnd, 'yyyy-MM-dd');
    let y = rangeStart.getFullYear();
    let m = rangeStart.getMonth();
    const endY = rangeEnd.getFullYear();
    const endM = rangeEnd.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const candidate = nthBusinessDayOfMonth(y, m, bd.n);
      if (candidate && candidate >= anchorDate && candidate >= startKey && candidate <= endKey) {
        dates.add(candidate);
      }
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return Array.from(dates);
  }

  try {
    const anchor = wallToRRuleDate(anchorDate, anchorTime);
    const rule = parseRecurrence(recurrenceRule, anchor);

    // Limites do dia local convertidos para a convenção do rrule.
    const start = wallToRRuleDate(format(rangeStart, 'yyyy-MM-dd'), '00:00');
    const end = new Date(wallToRRuleDate(format(rangeEnd, 'yyyy-MM-dd'), '23:59').getTime() + 59_999);

    const lookupStart = anchor < start ? start : anchor;

    const occurrences = rule.between(lookupStart, end, true);
    const skipHolidays = isWeekdayOnlyRule(recurrenceRule);
    const dates = new Set<string>();
    for (const d of occurrences) {
      const key = rruleDateToWall(d).date;
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
 * date must match the anchor's wall-clock time so rrule treats it as a real
 * occurrence to skip.
 */
export function addExdateToRecurrence(
  recurrenceRule: string,
  anchorDate: string,
  anchorTime: string | null | undefined,
  exceptionDate: string
): string {
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

  // Hora do EXDATE precisa casar com a do DTSTART real da regra; se não
  // existir, cai para o anchorTime/00:00. Isso evita gerar EXDATE T000000
  // que o rrule ignora silenciosamente.
  let timeHHMM = anchorTime || '00:00';
  if (dtstart) {
    const m = dtstart.match(/T(\d{2})(\d{2})(\d{2})/);
    if (m) timeHHMM = `${m[1]}:${m[2]}`;
  }

  if (!dtstart) dtstart = `DTSTART:${rruleDateToIcs(wallToRRuleDate(anchorDate, timeHHMM))}`;
  if (!rrule) rrule = trimmed.startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;

  exdates.push(`EXDATE:${rruleDateToIcs(wallToRRuleDate(exceptionDate, timeHHMM))}`);

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
  const newAnchor = wallToRRuleDate(newAnchorDate, newAnchorTime);
  const newAnchorIcs = rruleDateToIcs(newAnchor);
  const newTimeStr = `T${newAnchorIcs.slice(9)}`;

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let dtstartLine: string | null = null;
  let rruleLine: string | null = null;
  const exdates: string[] = [];

  for (const line of lines) {
    if (/^DTSTART[:;]/i.test(line)) dtstartLine = `DTSTART:${newAnchorIcs}`;
    else if (/^EXDATE[:;]/i.test(line)) {
      // Replace the time portion of each EXDATE date with the new time,
      // preserving the original date so the exception still applies.
      const replaced = line.replace(/(\d{8})T\d{6}/g, (_m, day) => `${day}${newTimeStr}`);
      exdates.push(replaced);
    } else if (/^RRULE[:;]/i.test(line)) rruleLine = line;
    else if (/^[A-Z]+=/i.test(line)) rruleLine = `RRULE:${line}`;
  }

  if (!dtstartLine) dtstartLine = `DTSTART:${newAnchorIcs}`;
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

  // Caso especial: regra "N-ésimo dia útil do mês"
  const bd = parseBusinessDayRule(recurrenceRule);
  if (bd) {
    const baseKey = currentDate || format(new Date(), 'yyyy-MM-dd');
    // Próximo a partir do dia seguinte ao atual
    const base = parseISO(`${baseKey}T12:00:00`);
    base.setDate(base.getDate() + 1);
    const next = nextNthBusinessDay(bd.n, base);
    if (!next) return null;
    return { dueDate: next, dueTime: currentTime || undefined };
  }

  try {
    const anchor = currentDate
      ? wallToRRuleDate(currentDate, currentTime)
      : nowAsRRuleDate();
    const rule = parseRecurrence(recurrenceRule, anchor);
    const next = rule.after(anchor, false);
    if (!next) return null;

    const wall = rruleDateToWall(next);
    return {
      dueDate: wall.date,
      dueTime: currentTime ? wall.time : undefined,
    };
  } catch (e) {
    console.error('nextOccurrence error', e);
    return null;
  }
}
