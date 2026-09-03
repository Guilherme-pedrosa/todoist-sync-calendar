import { describe, expect, it } from 'vitest';
import {
  addExdateToRecurrence,
  expandOccurrencesInRange,
  nextOccurrence,
  rewriteRecurrenceAnchor,
} from '@/lib/recurrence';

/**
 * Regressão do "almoço às 7h da manhã" (set/2026).
 *
 * O rrulestr interpreta DTSTART/EXDATE naive como UTC, mas o código antigo
 * formatava as ocorrências com date-fns em hora local — cada recálculo
 * deslocava o horário pelo offset do fuso (13:00 → 10:00 → 07:00 em
 * Brasília). Estes testes fixam a convenção wall-clock: o horário que entra
 * é o horário que sai, em qualquer fuso da máquina. Num fuso UTC o bug
 * antigo não se manifestaria, mas os testes seguem válidos como
 * especificação; na máquina de referência (America/Sao_Paulo) eles falham
 * com o código antigo.
 */

const ICS_DAILY_13H =
  'DTSTART:20260901T130000\nRRULE:FREQ=DAILY\nEXDATE:20260902T130000';

describe('nextOccurrence — preservação do horário de parede', () => {
  it('regra ICS (DTSTART+EXDATE): almoço 13:00 continua 13:00', () => {
    const next = nextOccurrence(ICS_DAILY_13H, '2026-09-01', '13:00');
    expect(next).toEqual({ dueDate: '2026-09-03', dueTime: '13:00' });
  });

  it('regra simples (bare RRULE): 13:00 continua 13:00', () => {
    const next = nextOccurrence('FREQ=DAILY', '2026-09-01', '13:00');
    expect(next).toEqual({ dueDate: '2026-09-02', dueTime: '13:00' });
  });

  it('dez conclusões seguidas não deslocam o horário (bug acumulativo)', () => {
    let rule = ICS_DAILY_13H;
    let date = '2026-09-01';
    let time: string | undefined = '13:00';
    for (let i = 0; i < 10; i++) {
      const next = nextOccurrence(rule, date, time);
      expect(next).not.toBeNull();
      date = next!.dueDate;
      time = next!.dueTime;
      // O app regrava o DTSTART a cada avanço da série — reproduz o ciclo real.
      rule = rewriteRecurrenceAnchor(rule, date, time ?? null);
      expect(time).toBe('13:00');
    }
    expect(date).toBe('2026-09-12');
  });

  it('EXDATE realmente pula a ocorrência excluída', () => {
    // 2026-09-02 tem EXDATE: a próxima após 01/09 deve ser 03/09.
    const next = nextOccurrence(ICS_DAILY_13H, '2026-09-01', '13:00');
    expect(next!.dueDate).toBe('2026-09-03');
  });

  it('tarefa sem hora (meia-noite) não recua um dia', () => {
    const rule = 'DTSTART:20260901T000000\nRRULE:FREQ=DAILY\nEXDATE:20260902T000000';
    const next = nextOccurrence(rule, '2026-09-01');
    expect(next).toEqual({ dueDate: '2026-09-03', dueTime: undefined });
  });

  it('semanal com BYDAY mantém dia e horário', () => {
    const rule = 'DTSTART:20260904T090000\nRRULE:FREQ=WEEKLY;BYDAY=FR\nEXDATE:20260911T090000';
    // 04/09/2026 é sexta; 11/09 excluída → próxima é 18/09 às 09:00.
    const next = nextOccurrence(rule, '2026-09-04', '09:00');
    expect(next).toEqual({ dueDate: '2026-09-18', dueTime: '09:00' });
  });
});

describe('expandOccurrencesInRange — datas de parede corretas', () => {
  it('regra ICS sem hora não desloca as ocorrências um dia para trás', () => {
    const rule = 'DTSTART:20260901T000000\nRRULE:FREQ=DAILY';
    const days = expandOccurrencesInRange(
      rule,
      '2026-09-01',
      null,
      new Date(2026, 8, 1),
      new Date(2026, 8, 4)
    );
    expect(days).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('EXDATE remove o dia excluído da expansão', () => {
    const days = expandOccurrencesInRange(
      ICS_DAILY_13H,
      '2026-09-01',
      '13:00',
      new Date(2026, 8, 1),
      new Date(2026, 8, 4)
    );
    expect(days).toEqual(['2026-09-01', '2026-09-03', '2026-09-04']);
  });

  it('âncora com hora tardia não vaza ocorrência para o dia seguinte', () => {
    const rule = 'DTSTART:20260901T230000\nRRULE:FREQ=DAILY';
    const days = expandOccurrencesInRange(
      rule,
      '2026-09-01',
      '23:00',
      new Date(2026, 8, 1),
      new Date(2026, 8, 2)
    );
    expect(days).toEqual(['2026-09-01', '2026-09-02']);
  });
});

describe('addExdateToRecurrence / rewriteRecurrenceAnchor — strings de parede', () => {
  it('gera DTSTART e EXDATE com o horário de parede exato', () => {
    const rule = addExdateToRecurrence('FREQ=DAILY', '2026-09-01', '13:00', '2026-09-05');
    expect(rule).toContain('DTSTART:20260901T130000');
    expect(rule).toContain('EXDATE:20260905T130000');
  });

  it('EXDATE gerado casa com a ocorrência e a exclui de verdade', () => {
    const rule = addExdateToRecurrence('FREQ=DAILY', '2026-09-01', '13:00', '2026-09-02');
    const next = nextOccurrence(rule, '2026-09-01', '13:00');
    expect(next).toEqual({ dueDate: '2026-09-03', dueTime: '13:00' });
  });

  it('rewriteRecurrenceAnchor grava o novo horário de parede no DTSTART e EXDATEs', () => {
    const moved = rewriteRecurrenceAnchor(ICS_DAILY_13H, '2026-09-03', '12:30');
    expect(moved).toContain('DTSTART:20260903T123000');
    expect(moved).toContain('EXDATE:20260902T123000');
    const next = nextOccurrence(moved, '2026-09-03', '12:30');
    expect(next).toEqual({ dueDate: '2026-09-04', dueTime: '12:30' });
  });
});
