import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label as UiLabel } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RRule, Frequency, Weekday } from 'rrule';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialRule?: string | null;
  startDate?: string; // yyyy-MM-dd, used for monthly/yearly anchors
  onSave: (rule: string) => void;
}

type FreqKey = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const FREQ_OPTIONS: Array<{ value: FreqKey; label: string }> = [
  { value: 'DAILY', label: 'dia' },
  { value: 'WEEKLY', label: 'semana' },
  { value: 'MONTHLY', label: 'mês' },
  { value: 'YEARLY', label: 'ano' },
];

const WEEKDAYS: Array<{ short: string; rrule: Weekday }> = [
  { short: 'S', rrule: RRule.SU },
  { short: 'M', rrule: RRule.MO },
  { short: 'T', rrule: RRule.TU },
  { short: 'Q', rrule: RRule.WE },
  { short: 'Q', rrule: RRule.TH },
  { short: 'S', rrule: RRule.FR },
  { short: 'S', rrule: RRule.SA },
];

export function RecurrenceCustomDialog({ open, onOpenChange, initialRule, onSave }: Props) {
  const [freq, setFreq] = useState<FreqKey>('WEEKLY');
  const [interval, setInterval] = useState(1);
  const [byday, setByday] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<'never' | 'count' | 'until'>('never');
  const [count, setCount] = useState(10);
  const [until, setUntil] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    try {
      if (initialRule) {
        const rule = RRule.fromString(initialRule.startsWith('RRULE:') ? initialRule : `RRULE:${initialRule}`);
        const o = rule.origOptions;
        const fmap: Record<number, FreqKey> = {
          [Frequency.DAILY]: 'DAILY',
          [Frequency.WEEKLY]: 'WEEKLY',
          [Frequency.MONTHLY]: 'MONTHLY',
          [Frequency.YEARLY]: 'YEARLY',
        };
        setFreq(fmap[o.freq as number] ?? 'WEEKLY');
        setInterval(o.interval ?? 1);
        const wds = (o.byweekday as Weekday[] | undefined) ?? [];
        setByday(wds.map((w: any) => (typeof w === 'number' ? w : w.weekday)));
        if (o.count) {
          setEndMode('count');
          setCount(o.count);
        } else if (o.until) {
          setEndMode('until');
          setUntil(new Date(o.until).toISOString().slice(0, 10));
        } else {
          setEndMode('never');
        }
      } else {
        setFreq('WEEKLY');
        setInterval(1);
        setByday([]);
        setEndMode('never');
      }
    } catch {
      // ignore
    }
  }, [open, initialRule]);

  const save = () => {
    const opts: any = {
      freq: Frequency[freq],
      interval: Math.max(1, interval),
    };
    if (freq === 'WEEKLY' && byday.length > 0) {
      opts.byweekday = byday.map((d) => new Weekday(d));
    }
    if (endMode === 'count') opts.count = Math.max(1, count);
    if (endMode === 'until' && until) opts.until = new Date(`${until}T23:59:59`);
    const rule = new RRule(opts).toString().replace('RRULE:', '');
    onSave(rule);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Repetir personalizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Interval + freq */}
          <div className="space-y-1.5">
            <UiLabel className="text-xs text-muted-foreground">A cada</UiLabel>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value) || 1)}
                className="w-20 h-9"
              />
              <div className="flex items-center gap-1 flex-wrap">
                {FREQ_OPTIONS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFreq(f.value)}
                    className={cn(
                      'h-9 px-3 text-xs rounded-md border transition-colors',
                      freq === f.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Weekly days */}
          {freq === 'WEEKLY' && (
            <div className="space-y-1.5">
              <UiLabel className="text-xs text-muted-foreground">Em</UiLabel>
              <div className="flex items-center gap-1">
                {WEEKDAYS.map((d) => {
                  const wd = d.rrule.weekday;
                  const active = byday.includes(wd);
                  return (
                    <button
                      key={d.rrule.toString() + wd}
                      type="button"
                      onClick={() =>
                        setByday((prev) =>
                          active ? prev.filter((x) => x !== wd) : [...prev, wd]
                        )
                      }
                      className={cn(
                        'h-9 w-9 text-xs rounded-full border transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End */}
          <div className="space-y-1.5">
            <UiLabel className="text-xs text-muted-foreground">Termina</UiLabel>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={endMode === 'never'}
                  onChange={() => setEndMode('never')}
                />
                Nunca
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={endMode === 'count'}
                  onChange={() => setEndMode('count')}
                />
                Após
                <Input
                  type="number"
                  min={1}
                  value={count}
                  disabled={endMode !== 'count'}
                  onChange={(e) => setCount(Number(e.target.value) || 1)}
                  className="w-16 h-7 text-xs"
                />
                ocorrências
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={endMode === 'until'}
                  onChange={() => setEndMode('until')}
                />
                Em
                <Input
                  type="date"
                  value={until}
                  disabled={endMode !== 'until'}
                  onChange={(e) => setUntil(e.target.value)}
                  className="w-40 h-7 text-xs"
                />
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
