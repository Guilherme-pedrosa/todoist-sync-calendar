import { useState } from 'react';
import { addDays, format, nextSaturday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Repeat,
  Sun,
  Sunrise,
  X,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { RRule, Frequency } from 'rrule';
import { recurrenceRuleToLabel } from '@/lib/nlp';

export interface DateValue {
  date?: string; // yyyy-MM-dd
  time?: string; // HH:mm
  recurrenceRule?: string | null;
}

interface Props {
  value: DateValue;
  onChange: (v: DateValue) => void;
  trigger?: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

const RECURRENCE_PRESETS: Array<{ label: string; build: () => string }> = [
  { label: 'Diariamente', build: () => new RRule({ freq: Frequency.DAILY, interval: 1 }).toString().replace('RRULE:', '') },
  { label: 'Dias úteis (seg-sex)', build: () => new RRule({ freq: Frequency.WEEKLY, interval: 1, byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR] }).toString().replace('RRULE:', '') },
  { label: 'Semanalmente', build: () => new RRule({ freq: Frequency.WEEKLY, interval: 1 }).toString().replace('RRULE:', '') },
  { label: 'Mensalmente', build: () => new RRule({ freq: Frequency.MONTHLY, interval: 1 }).toString().replace('RRULE:', '') },
  { label: 'Anualmente', build: () => new RRule({ freq: Frequency.YEARLY, interval: 1 }).toString().replace('RRULE:', '') },
];

export function DatePickerPopover({ value, onChange, trigger, align = 'start' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value.date ? new Date(`${value.date}T00:00:00`) : undefined;

  const setQuick = (d: Date) => {
    onChange({ ...value, date: format(d, 'yyyy-MM-dd') });
  };

  const recurrenceLabel = recurrenceRuleToLabel(value.recurrenceRule);

  const summary = (() => {
    if (!value.date && !value.recurrenceRule) return 'Data';
    const parts: string[] = [];
    if (value.date) {
      const d = new Date(`${value.date}T00:00:00`);
      parts.push(format(d, "d MMM", { locale: ptBR }));
    }
    if (value.time) parts.push(value.time);
    if (recurrenceLabel) parts.push(`↻ ${recurrenceLabel}`);
    return parts.join(' · ');
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
              value.date || value.recurrenceRule
                ? 'border-primary/30 text-primary bg-primary/5'
                : 'border-border text-muted-foreground hover:border-primary/30'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {summary}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align={align}>
        <div className="p-2 border-b border-border space-y-0.5">
          <PresetRow
            icon={<Sun className="h-3.5 w-3.5 text-priority-3" />}
            label="Hoje"
            shortcut={format(new Date(), 'EEE', { locale: ptBR })}
            onClick={() => setQuick(new Date())}
          />
          <PresetRow
            icon={<Sunrise className="h-3.5 w-3.5 text-warning" />}
            label="Amanhã"
            shortcut={format(addDays(new Date(), 1), 'EEE', { locale: ptBR })}
            onClick={() => setQuick(addDays(new Date(), 1))}
          />
          <PresetRow
            icon={<CalendarDays className="h-3.5 w-3.5 text-accent" />}
            label="Próximo fim de semana"
            shortcut={format(nextSaturday(new Date()), 'EEE', { locale: ptBR })}
            onClick={() => setQuick(nextSaturday(new Date()))}
          />
          <PresetRow
            icon={<CalendarClock className="h-3.5 w-3.5 text-success" />}
            label="Próxima semana"
            shortcut={format(addDays(new Date(), 7), 'EEE d', { locale: ptBR })}
            onClick={() => setQuick(addDays(new Date(), 7))}
          />
          {value.date && (
            <PresetRow
              icon={<CalendarX className="h-3.5 w-3.5 text-destructive" />}
              label="Sem data"
              onClick={() => onChange({ date: undefined, time: undefined, recurrenceRule: value.recurrenceRule })}
            />
          )}
        </div>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) onChange({ ...value, date: format(d, 'yyyy-MM-dd') });
          }}
          locale={ptBR}
          className={cn('p-3 pointer-events-auto')}
        />
        <div className="p-2 border-t border-border space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Hora</span>
            <Input
              type="time"
              value={value.time ?? ''}
              onChange={(e) => onChange({ ...value, time: e.target.value || undefined })}
              className="h-7 text-xs ml-auto w-[110px]"
            />
            {value.time && (
              <button
                onClick={() => onChange({ ...value, time: undefined })}
                className="p-1 rounded hover:bg-muted"
                aria-label="Remover hora"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border transition-colors',
                  value.recurrenceRule
                    ? 'border-accent/40 text-accent bg-accent/5'
                    : 'border-border text-muted-foreground hover:border-accent/40'
                )}
              >
                <Repeat className="h-3.5 w-3.5" />
                {recurrenceLabel || 'Repetir'}
                {value.recurrenceRule && (
                  <X
                    className="h-3 w-3 ml-auto"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange({ ...value, recurrenceRule: null });
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              {RECURRENCE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onChange({ ...value, recurrenceRule: p.build() })}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                >
                  {p.label}
                </button>
              ))}
              {value.recurrenceRule && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => onChange({ ...value, recurrenceRule: null })}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
                  >
                    Remover recorrência
                  </button>
                </>
              )}
            </PopoverContent>
          </Popover>
          <Button size="sm" className="w-full h-7 text-xs" onClick={() => setOpen(false)}>
            Confirmar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetRow({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors text-left"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-muted-foreground capitalize">{shortcut}</span>}
    </button>
  );
}
