import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import { RRule, Frequency } from 'rrule';
import { buildBusinessDayRule, businessDayRuleLabel, parseBusinessDayRule, nextNthBusinessDay } from '@/lib/businessDay';

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
  // N-ésimo dia útil do mês: "primeiro dia útil do mês", "5º dia útil",
  // "ultimo dia util do mes", "segundo dia útil"
  {
    re: /\b(primeiro|segundo|terceiro|quarto|quinto|sexto|s[ée]timo|oitavo|nono|d[ée]cimo|[úu]ltimo|(\d{1,2})\s*(?:º|o|°)?)\s+dia\s+[úu]til(?:\s+(?:do|de)\s+(?:cada\s+)?m[êe]s)?\b/i,
    build: (m) => {
      const ordWord = (m[1] || '').toLowerCase();
      const ordMap: Record<string, number> = {
        primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5,
        sexto: 6, setimo: 7, sétimo: 7, oitavo: 8, nono: 9, decimo: 10, décimo: 10,
        ultimo: -1, último: -1,
      };
      let n = ordMap[ordWord];
      if (n === undefined) {
        const num = parseInt(m[2] || ordWord, 10);
        n = Number.isFinite(num) && num > 0 ? num : 1;
      }
      return { rule: buildBusinessDayRule(n), label: businessDayRuleLabel(n) };
    },
  },
  // dia útil / dias úteis / todo dia útil / work days / seg a sexta — MUST come before "todo dia"
  {
    re: /\b(?:todo[s]?\s+(?:os\s+)?dias?\s+(?:[úu]til|[úu]te[ií]s)|dias?\s+(?:[úu]til|[úu]te[ií]s)|every\s+(?:weekday|work\s*day|business\s*day)s?|(?:weekday|work\s*day|business\s*day)s?|seg(?:unda)?\s*(?:a|à|ate|até|-)\s*sex(?:ta)?|segunda(?:-feira)?\s*(?:a|à|ate|até|-)\s*sexta(?:-feira)?|mon(?:day)?\s*(?:to|-)\s*fri(?:day)?)\b/i,
    build: () => ({
      rule: new RRule({
        freq: Frequency.WEEKLY,
        interval: 1,
        byweekday: [RRule.MO.weekday, RRule.TU.weekday, RRule.WE.weekday, RRule.TH.weekday, RRule.FR.weekday],
      }).toString().replace('RRULE:', ''),
      label: 'dia útil',
    }),
  },
  // Nth weekday of the month: "toda primeira segunda", "toda última sexta do mês",
  // "first monday of the month", "last friday of every month"
  {
    re: /\b(?:(?:toda|todo|every)\s+)?(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|[úu]ltim[ao]|first|second|third|fourth|last)\s+(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*-?feira)?\s+(?:do|de|of)\s+(?:cada\s+|the\s+|every\s+)?m[êe]s\b|\b(?:(?:toda|todo|every)\s+)?(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|[úu]ltim[ao]|first|second|third|fourth|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+of\s+(?:the\s+|every\s+)?month\b/i,
    build: (m) => {
      const ordMap: Record<string, number> = {
        primeira: 1, primeiro: 1, first: 1,
        segunda: 2, segundo: 2, second: 2,
        terceira: 3, terceiro: 3, third: 3,
        quarta: 4, quarto: 4, fourth: 4,
        ultima: -1, última: -1, ultimo: -1, último: -1, last: -1,
      };
      const wdMap: Record<string, any> = {
        segunda: RRule.MO, monday: RRule.MO,
        terca: RRule.TU, terça: RRule.TU, tuesday: RRule.TU,
        quarta: RRule.WE, wednesday: RRule.WE,
        quinta: RRule.TH, thursday: RRule.TH,
        sexta: RRule.FR, friday: RRule.FR,
        sabado: RRule.SA, sábado: RRule.SA, saturday: RRule.SA,
        domingo: RRule.SU, sunday: RRule.SU,
      };
      const ordRaw = (m[1] || m[3] || '').toLowerCase();
      const wdKey = (m[2] || m[4] || '').toLowerCase();
      const ord = ordMap[ordRaw] ?? 1;
      const wd = wdMap[wdKey] ?? RRule.MO;
      const rule = new RRule({
        freq: Frequency.MONTHLY,
        interval: 1,
        byweekday: [wd.nth(ord)],
      }).toString().replace('RRULE:', '');
      const ordLabel = ord === -1 ? 'última' : ordRaw;
      return { rule, label: `${ordLabel} ${wdKey} do mês` };
    },
  },
  // "todo dia N" / "dia N de cada mês" / "every Nth"  → monthly by day-of-month
  {
    re: /\b(?:todo\s+dia\s+(\d{1,2})|dia\s+(\d{1,2})\s+de\s+(?:cada\s+)?m[êe]s|on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:each|every)\s+month|every\s+month\s+on\s+the\s+(\d{1,2}))\b/i,
    build: (m) => {
      const day = parseInt(m[1] || m[2] || m[3] || m[4], 10);
      const safeDay = Math.min(Math.max(day, 1), 31);
      const rule = new RRule({
        freq: Frequency.MONTHLY,
        interval: 1,
        bymonthday: [safeDay],
      }).toString().replace('RRULE:', '');
      return { rule, label: `todo dia ${safeDay}` };
    },
  },
  // "a cada N dias/semanas/meses/anos"
  {
    re: /\b(?:a\s+cada|cada|every)\s+(\d+)\s+(dias?|semanas?|m[êe]s(?:es)?|anos?|days?|weeks?|months?|years?)\b/i,
    build: (m) => {
      const n = Math.max(1, parseInt(m[1], 10));
      const unit = m[2].toLowerCase();
      let freq = Frequency.DAILY;
      let unitLabel = 'dias';
      if (/semana|week/.test(unit)) { freq = Frequency.WEEKLY; unitLabel = 'semanas'; }
      else if (/m[êe]s|month/.test(unit)) { freq = Frequency.MONTHLY; unitLabel = 'meses'; }
      else if (/ano|year/.test(unit)) { freq = Frequency.YEARLY; unitLabel = 'anos'; }
      const rule = new RRule({ freq, interval: n }).toString().replace('RRULE:', '');
      return { rule, label: `a cada ${n} ${unitLabel}` };
    },
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
