import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import { RRule, Frequency } from 'rrule';

const ptParser = chrono.pt.casual.clone();

export interface ParsedNlp {
  cleanedTitle: string;
  dueDate?: string; // yyyy-MM-dd
  dueTime?: string; // HH:mm
  hasTime: boolean;
  recurrenceRule?: string; // RFC5545
  recurrenceLabel?: string;
  priority?: 1 | 2 | 3 | 4;
  labelTokens: string[];
  projectToken?: string;
  matchedRanges: Array<{ start: number; end: number; type: string }>;
}

function expandDateRange(text: string, start: number, end: number) {
  let expandedStart = start;
  const prefix = text.slice(0, start);
  const preposition = prefix.match(/(?:^|\s)(?:[àa]s?|ao)\s*$/i);
  if (preposition) expandedStart = start - preposition[0].length;
  return { start: expandedStart, end };
}

const RECURRENCE_PATTERNS: Array<{
  re: RegExp;
  build: (m: RegExpExecArray) => { rule: string; label: string };
}> = [
  // dia útil / dias úteis / todo dia útil / weekdays — MUST come before "todo dia"
  {
    re: /\b(?:todo[s]?\s+(?:os\s+)?dias?\s+[úu]te[ií]s|dias?\s+[úu]te[ií]s|every\s+weekday|weekdays?)\b/i,
    build: () => ({
      rule: new RRule({
        freq: Frequency.WEEKLY,
        interval: 1,
        byweekday: [RRule.MO.weekday, RRule.TU.weekday, RRule.WE.weekday, RRule.TH.weekday, RRule.FR.weekday],
      }).toString().replace('RRULE:', ''),
      label: 'dia útil',
    }),
  },
  // todo dia / todos os dias / diariamente / every day / daily
  {
    re: /\b(todo dia|todos os dias|diariamente|every ?day|daily|cada dia)\b/i,
    build: () => ({
      rule: new RRule({ freq: Frequency.DAILY, interval: 1 }).toString().replace('RRULE:', ''),
      label: 'todo dia',
    }),
  },
  // toda semana / semanalmente / weekly
  {
    re: /\b(toda semana|todas as semanas|semanalmente|every ?week|weekly)\b/i,
    build: () => ({
      rule: new RRule({ freq: Frequency.WEEKLY, interval: 1 }).toString().replace('RRULE:', ''),
      label: 'toda semana',
    }),
  },
  // todo mês / mensalmente / monthly
  {
    re: /\b(todo m[êe]s|todos os meses|mensalmente|every ?month|monthly)\b/i,
    build: () => ({
      rule: new RRule({ freq: Frequency.MONTHLY, interval: 1 }).toString().replace('RRULE:', ''),
      label: 'todo mês',
    }),
  },
  // todo ano / anualmente
  {
    re: /\b(todo ano|todos os anos|anualmente|every ?year|yearly|annually)\b/i,
    build: () => ({
      rule: new RRule({ freq: Frequency.YEARLY, interval: 1 }).toString().replace('RRULE:', ''),
      label: 'todo ano',
    }),
  },
  // toda segunda/terça etc.
  {
    re: /\btoda(?:s as)? (segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)s?\b/i,
    build: (m) => {
      const map: Record<string, number> = {
        segunda: RRule.MO.weekday,
        terca: RRule.TU.weekday,
        terça: RRule.TU.weekday,
        quarta: RRule.WE.weekday,
        quinta: RRule.TH.weekday,
        sexta: RRule.FR.weekday,
        sabado: RRule.SA.weekday,
        sábado: RRule.SA.weekday,
        domingo: RRule.SU.weekday,
      };
      const key = m[1].toLowerCase();
      const wd = map[key] ?? RRule.MO.weekday;
      const rule = new RRule({
        freq: Frequency.WEEKLY,
        interval: 1,
        byweekday: [wd],
      }).toString().replace('RRULE:', '');
      return { rule, label: `toda ${key}` };
    },
  },
];

const PRIORITY_RE = /\b(?:p|!)([1-4])\b/i;
const LABEL_RE = /(?:^|\s)@([a-zA-Z0-9_\-áéíóúâêôãõç]+)/gi;
const PROJECT_RE = /(?:^|\s)#([a-zA-Z0-9_\-áéíóúâêôãõç]+)/i;

export function parseNlp(input: string): ParsedNlp {
  const matchedRanges: ParsedNlp['matchedRanges'] = [];
  let working = input;

  // 1) recurrence first (so we can strip before chrono runs)
  let recurrenceRule: string | undefined;
  let recurrenceLabel: string | undefined;
  for (const pattern of RECURRENCE_PATTERNS) {
    const m = pattern.re.exec(working);
    if (m) {
      const { rule, label } = pattern.build(m);
      recurrenceRule = rule;
      recurrenceLabel = label;
      matchedRanges.push({ start: m.index, end: m.index + m[0].length, type: 'recurrence' });
      working =
        working.slice(0, m.index) + ' '.repeat(m[0].length) + working.slice(m.index + m[0].length);
      break;
    }
  }

  // 2) priority
  let priority: 1 | 2 | 3 | 4 | undefined;
  const pm = PRIORITY_RE.exec(working);
  if (pm) {
    priority = Number(pm[1]) as 1 | 2 | 3 | 4;
    matchedRanges.push({ start: pm.index, end: pm.index + pm[0].length, type: 'priority' });
    working = working.slice(0, pm.index) + ' '.repeat(pm[0].length) + working.slice(pm.index + pm[0].length);
  }

  // 3) labels (multiple)
  const labelTokens: string[] = [];
  let lm: RegExpExecArray | null;
  LABEL_RE.lastIndex = 0;
  while ((lm = LABEL_RE.exec(working)) !== null) {
    labelTokens.push(lm[1]);
    matchedRanges.push({ start: lm.index, end: lm.index + lm[0].length, type: 'label' });
  }
  // do not strip labels yet — we strip from cleaned title later

  // 4) project (first only)
  let projectToken: string | undefined;
  const prm = PROJECT_RE.exec(working);
  if (prm) {
    projectToken = prm[1];
    matchedRanges.push({ start: prm.index, end: prm.index + prm[0].length, type: 'project' });
  }

  // 5) date/time via chrono
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let hasTime = false;
  try {
    const results = ptParser.parse(working, new Date(), { forwardDate: true });
    if (results.length > 0) {
      const r = results[0];
      const d = r.start.date();
      dueDate = format(d, 'yyyy-MM-dd');
      hasTime = r.start.isCertain('hour');
      if (hasTime) {
        dueTime = format(d, 'HH:mm');
      }
      const range = expandDateRange(working, r.index, r.index + r.text.length);
      matchedRanges.push({ ...range, type: 'date' });
    }
  } catch {
    // ignore
  }

  // build cleaned title: remove all matched ranges
  const sorted = [...matchedRanges].sort((a, b) => a.start - b.start);
  let cleaned = '';
  let cursor = 0;
  for (const range of sorted) {
    cleaned += input.slice(cursor, range.start);
    cursor = range.end;
  }
  cleaned += input.slice(cursor);
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    cleanedTitle: cleaned || input.trim(),
    dueDate,
    dueTime,
    hasTime,
    recurrenceRule,
    recurrenceLabel,
    priority,
    labelTokens,
    projectToken,
    matchedRanges,
  };
}

export function highlightNlp(input: string, parsed: ParsedNlp): React.ReactNode[] {
  const colorByType: Record<string, string> = {
    date: 'text-primary',
    recurrence: 'text-accent',
    priority: 'text-priority-2',
    label: 'text-accent',
    project: 'text-success',
  };
  const sorted = [...parsed.matchedRanges].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((range, i) => {
    if (range.start > cursor) {
      parts.push(input.slice(cursor, range.start));
    }
    parts.push({
      type: 'span',
      key: i,
      className: `font-medium ${colorByType[range.type] || ''}`,
      children: input.slice(range.start, range.end),
    } as any);
    cursor = range.end;
  });
  if (cursor < input.length) parts.push(input.slice(cursor));
  return parts;
}

export function recurrenceRuleToLabel(rule: string | null | undefined): string | null {
  if (!rule) return null;
  try {
    const normalized = rule.toUpperCase();
    if (/FREQ=WEEKLY/.test(normalized) && /BYDAY=MO,TU,WE,TH,FR/.test(normalized)) {
      return 'Todo dia útil';
    }
    const r = RRule.fromString(rule.startsWith('RRULE:') ? rule : `RRULE:${rule}`);
    return r.toText();
  } catch {
    return rule;
  }
}
