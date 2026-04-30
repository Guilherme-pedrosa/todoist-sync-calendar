// Cálculo do N-ésimo dia útil do mês, considerando feriados nacionais brasileiros.
// Dia útil = segunda a sexta E não feriado nacional.

import { format } from 'date-fns';
import { getHolidayForDate } from '@/lib/holidays';

export function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const key = format(date, 'yyyy-MM-dd');
  const h = getHolidayForDate(key);
  if (h?.type === 'national') return false;
  return true;
}

/**
 * Retorna a data (yyyy-MM-dd) do N-ésimo dia útil do mês informado.
 * N=-1 significa último dia útil. Retorna undefined se inexistente.
 */
export function nthBusinessDayOfMonth(year: number, month0: number, n: number): string | undefined {
  if (n === 0) return undefined;
  if (n > 0) {
    let count = 0;
    const d = new Date(year, month0, 1);
    while (d.getMonth() === month0) {
      if (isBusinessDay(d)) {
        count += 1;
        if (count === n) return format(d, 'yyyy-MM-dd');
      }
      d.setDate(d.getDate() + 1);
    }
    return undefined;
  }
  // N negativo (ex.: -1 = último)
  const target = -n;
  let count = 0;
  const d = new Date(year, month0 + 1, 0); // último dia do mês
  while (d.getMonth() === month0) {
    if (isBusinessDay(d)) {
      count += 1;
      if (count === target) return format(d, 'yyyy-MM-dd');
    }
    d.setDate(d.getDate() - 1);
  }
  return undefined;
}

/**
 * Próxima ocorrência (≥ from) do N-ésimo dia útil mensal.
 */
export function nextNthBusinessDay(n: number, from: Date): string | undefined {
  let year = from.getFullYear();
  let month = from.getMonth();
  const fromKey = format(from, 'yyyy-MM-dd');
  for (let i = 0; i < 24; i += 1) {
    const candidate = nthBusinessDayOfMonth(year, month, n);
    if (candidate && candidate >= fromKey) return candidate;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return undefined;
}

/**
 * Marker armazenado no campo recurrence_rule para regras de "N-ésimo dia útil do mês".
 * Formato: `X-BUSINESSDAY=N;FREQ=MONTHLY;INTERVAL=1`
 */
export function buildBusinessDayRule(n: number): string {
  return `X-BUSINESSDAY=${n};FREQ=MONTHLY;INTERVAL=1`;
}

export function parseBusinessDayRule(rule: string | null | undefined): { n: number } | null {
  if (!rule) return null;
  const m = /X-BUSINESSDAY=(-?\d+)/i.exec(rule);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n === 0) return null;
  return { n };
}

export function businessDayRuleLabel(n: number): string {
  if (n === -1) return 'último dia útil do mês';
  const ord: Record<number, string> = { 1: 'primeiro', 2: 'segundo', 3: 'terceiro', 4: 'quarto', 5: 'quinto', 6: 'sexto', 7: 'sétimo', 8: 'oitavo', 9: 'nono', 10: 'décimo' };
  return `${ord[n] ?? `${n}º`} dia útil do mês`;
}
