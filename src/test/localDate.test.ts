import { describe, expect, it } from 'vitest';
import { localDateKey } from '@/lib/localDate';

describe('localDateKey', () => {
  it('mantém o dia civil do aparelho mesmo no fim da noite', () => {
    expect(localDateKey(new Date(2026, 6, 14, 23, 59, 59))).toBe('2026-07-14');
  });

  it('preenche mês e dia com zero', () => {
    expect(localDateKey(new Date(2026, 0, 2, 12, 0, 0))).toBe('2026-01-02');
  });
});
