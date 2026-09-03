import { describe, expect, it } from 'vitest';
import { recurrenceRuleToLabel } from '@/lib/nlp';

describe('recurrenceRuleToLabel', () => {
  it('regra simples vira texto legível', () => {
    expect(recurrenceRuleToLabel('FREQ=DAILY')).toBe('every day');
  });

  it('todo dia útil tem label dedicado', () => {
    expect(recurrenceRuleToLabel('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Todo dia útil');
  });

  it('bloco ICS com DTSTART/EXDATE não vaza a string crua no chip', () => {
    const rule = 'DTSTART:20260901T130000\nRRULE:FREQ=DAILY\nEXDATE:20260902T130000';
    expect(recurrenceRuleToLabel(rule)).toBe('every day');
  });

  it('bloco ICS semanal preserva a descrição da regra', () => {
    const rule = 'DTSTART:20260904T090000\nRRULE:FREQ=WEEKLY;BYDAY=FR\nEXDATE:20260911T090000';
    expect(recurrenceRuleToLabel(rule)).toBe('every week on Friday');
  });
});
