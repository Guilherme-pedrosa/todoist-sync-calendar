// Feriados nacionais do Brasil
// Inclui feriados fixos + móveis (calculados a partir da Páscoa)

import { format, addDays } from 'date-fns';

export type Holiday = {
  date: string; // yyyy-MM-dd
  name: string;
  type: 'national' | 'optional'; // optional = ponto facultativo (Carnaval, Corpus Christi)
};

// Algoritmo de Meeus/Jones/Butcher para cálculo da Páscoa
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

export function getBrazilianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const carnavalSegunda = addDays(easter, -48);
  const carnavalTerca = addDays(easter, -47);
  const quartaCinzas = addDays(easter, -46);
  const sextaSanta = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);

  return [
    { date: `${year}-01-01`, name: 'Confraternização Universal', type: 'national' },
    { date: fmt(carnavalSegunda), name: 'Carnaval (segunda)', type: 'optional' },
    { date: fmt(carnavalTerca), name: 'Carnaval', type: 'optional' },
    { date: fmt(quartaCinzas), name: 'Quarta-feira de Cinzas (até 12h)', type: 'optional' },
    { date: fmt(sextaSanta), name: 'Sexta-feira Santa', type: 'national' },
    { date: fmt(easter), name: 'Páscoa', type: 'national' },
    { date: `${year}-04-21`, name: 'Tiradentes', type: 'national' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho', type: 'national' },
    { date: fmt(corpusChristi), name: 'Corpus Christi', type: 'optional' },
    { date: `${year}-09-07`, name: 'Independência do Brasil', type: 'national' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', type: 'national' },
    { date: `${year}-11-02`, name: 'Finados', type: 'national' },
    { date: `${year}-11-15`, name: 'Proclamação da República', type: 'national' },
    { date: `${year}-11-20`, name: 'Consciência Negra', type: 'national' },
    { date: `${year}-12-25`, name: 'Natal', type: 'national' },
  ];
}

// Cache simples por ano
const cache = new Map<number, Map<string, Holiday>>();

function getYearMap(year: number): Map<string, Holiday> {
  let m = cache.get(year);
  if (!m) {
    m = new Map(getBrazilianHolidays(year).map((h) => [h.date, h]));
    cache.set(year, m);
  }
  return m;
}

/** Retorna o feriado para uma data (yyyy-MM-dd) ou undefined. */
export function getHolidayForDate(dateKey: string): Holiday | undefined {
  const year = parseInt(dateKey.slice(0, 4), 10);
  if (Number.isNaN(year)) return undefined;
  return getYearMap(year).get(dateKey);
}
