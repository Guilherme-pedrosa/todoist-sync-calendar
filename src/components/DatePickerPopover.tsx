import { useEffect, useState } from 'react';
import { addDays, format, nextSaturday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Clock3,
  Repeat,
  Sun,
  Sunrise,
  X,
  Check,
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
import { recurrenceRuleToLabel, parseNlp } from '@/lib/nlp';
import { RecurrenceCustomDialog } from '@/components/RecurrenceCustomDialog';

export interface DateValue {
  date?: string; // yyyy-MM-dd
  time?: string; // HH:mm
  durationMinutes?: number | null;
  recurrenceRule?: string | null;
}

const DURATION_PRESETS: Array<{ label: string; minutes: number | null }> = [
  { label: 'Sem duração', minutes: null },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 h', minutes: 60 },
  { label: '1h 30', minutes: 90 },
  { label: '2 h', minutes: 120 },
  { label: '3 h', minutes: 180 },
];

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

interface Props {
  value: DateValue;
  onChange: (v: DateValue) => void;
  trigger?: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  /** When true, edits are buffered locally and only committed on OK / popover close. */
  commitOnClose?: boolean;
}

function buildPresets(anchor?: string): Array<{ label: string; build: () => string }> {
  const ref = anchor ? parseISO(`${anchor}T00:00:00`) : new Date();
  const dayIdx = ref.getDay(); // 0 Sun .. 6 Sat
  const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const dayOfMonth = ref.getDate();
  const month = ref.getMonth();
  const monthName = format(ref, 'MMMM', { locale: ptBR });
  const wdayMap = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];

  return [
    { label: 'Todo dia', build: () => new RRule({ freq: Frequency.DAILY, interval: 1 }).toString().replace('RRULE:', '') },
    { label: `Toda ${dayNames[dayIdx]}`, build: () => new RRule({ freq: Frequency.WEEKLY, interval: 1, byweekday: [wdayMap[dayIdx]] }).toString().replace('RRULE:', '') },
    { label: 'Todo dia útil', build: () => new RRule({ freq: Frequency.WEEKLY, interval: 1, byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR] }).toString().replace('RRULE:', '') },
    { label: `Todo mês no dia ${dayOfMonth}`, build: () => new RRule({ freq: Frequency.MONTHLY, interval: 1, bymonthday: [dayOfMonth] }).toString().replace('RRULE:', '') },
    { label: `Todo ano em ${dayOfMonth} ${monthName}`, build: () => new RRule({ freq: Frequency.YEARLY, interval: 1, bymonth: [month + 1], bymonthday: [dayOfMonth] }).toString().replace('RRULE:', '') },
  ];
}

export function DatePickerPopover({ value, onChange, trigger, align = 'start', commitOnClose = false }: Props) {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [recurrenceMenuOpen, setRecurrenceMenuOpen] = useState(false);
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  // When commitOnClose is enabled, edits go to a local buffer and are only
  // pushed to the parent on close (OK button or outside click). This avoids
  // firing the recurring-edit prompt on every keystroke/day-click.
  const [draft, setDraft] = useState<DateValue>(value);
  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  const current = commitOnClose ? draft : value;
  const emit = (v: DateValue) => {
    if (commitOnClose) setDraft(v);
    else onChange(v);
  };

  const selected = current.date ? new Date(`${current.date}T00:00:00`) : undefined;

  useEffect(() => {
    if (!open) setTextInput('');
  }, [open]);

  const setQuick = (d: Date) => {
    emit({ ...current, date: format(d, 'yyyy-MM-dd') });
  };

  const recurrenceLabel = recurrenceRuleToLabel(value.recurrenceRule);
  const currentRecurrenceLabel = recurrenceRuleToLabel(current.recurrenceRule);
  const hasCurrentValue = !!(current.date || current.recurrenceRule);

  const summary = (() => {
    if (!value.date && !value.recurrenceRule) return 'Sem data';
    const parts: string[] = [];
    if (value.date) {
      const d = new Date(`${value.date}T00:00:00`);
      parts.push(format(d, "d MMM", { locale: ptBR }));
    }
    if (value.time) {
      if (value.durationMinutes && value.durationMinutes > 0) {
        parts.push(`${value.time} → ${addMinutesToTime(value.time, value.durationMinutes)}`);
      } else {
        parts.push(value.time);
      }
    }
    if (recurrenceLabel) parts.push(`↻ ${recurrenceLabel}`);
    return parts.join(' · ');
  })();

  const hasValue = !!(value.date || value.recurrenceRule);

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    const parsed = parseNlp(textInput);
    const next: DateValue = { ...current };
    if (parsed.dueDate) next.date = parsed.dueDate;
    if (parsed.dueTime) next.time = parsed.dueTime;
    if (parsed.durationMinutes !== undefined) next.durationMinutes = parsed.durationMinutes;
    if (parsed.recurrenceRule) next.recurrenceRule = parsed.recurrenceRule;
    emit(next);
    setTextInput('');
  };

  const presets = buildPresets(current.date);

  const handleOpenChange = (next: boolean) => {
    if (!next && commitOnClose) {
      const changed =
        draft.date !== value.date ||
        draft.time !== value.time ||
        draft.durationMinutes !== value.durationMinutes ||
        draft.recurrenceRule !== value.recurrenceRule;
      if (changed) onChange(draft);
    }
    setOpen(next);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          {trigger ?? (
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors',
                hasValue
                  ? 'border-primary/30 text-primary bg-primary/5'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {summary}
              {hasValue && (
                <X
                  className="h-3 w-3 ml-1 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange({ date: undefined, time: undefined, recurrenceRule: null });
                  }}
                />
              )}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="w-[320px] p-0 flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(85vh, 600px)' }}
          align={align}
          collisionPadding={16}
          avoidCollisions
        >
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          {/* Free-text NLP input */}
          <div className="p-2 border-b border-border">
            <Input
              placeholder='Ex.: "amanhã 14h" ou "toda segunda"'
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleTextSubmit();
                }
              }}
              className="h-8 text-xs"
            />
          </div>

          <div className="p-2 border-b border-border space-y-0.5">
            <PresetRow
              icon={<Sun className="h-3.5 w-3.5 text-success" />}
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
              icon={<CalendarDays className="h-3.5 w-3.5 text-primary" />}
              label="Este fim de semana"
              shortcut={format(nextSaturday(new Date()), 'EEE', { locale: ptBR })}
              onClick={() => setQuick(nextSaturday(new Date()))}
            />
            <PresetRow
              icon={<CalendarClock className="h-3.5 w-3.5 text-accent" />}
              label="Próxima semana"
              shortcut={format(addDays(new Date(), 7), 'EEE d', { locale: ptBR })}
              onClick={() => setQuick(addDays(new Date(), 7))}
            />
            {current.date && (
              <PresetRow
                icon={<CalendarX className="h-3.5 w-3.5 text-muted-foreground" />}
                label="Sem vencimento"
                onClick={() => emit({ date: undefined, time: undefined, recurrenceRule: current.recurrenceRule })}
              />
            )}
          </div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) emit({ ...current, date: format(d, 'yyyy-MM-dd') });
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
                value={current.time ?? ''}
                onChange={(e) => emit({ ...current, time: e.target.value || undefined })}
                className="h-7 text-xs ml-auto w-[110px]"
              />
              {current.time && (
                <button
                  onClick={() => emit({ ...current, time: undefined })}
                  className="p-1 rounded hover:bg-muted"
                  aria-label="Remover hora"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Duração — só aparece quando há hora */}
            {current.time && (
              <div className="flex items-center gap-2">
                <Clock3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Duração</span>
                <Popover open={durationMenuOpen} onOpenChange={setDurationMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors',
                        current.durationMinutes
                          ? 'border-primary/30 text-primary bg-primary/5'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      )}
                    >
                      {current.durationMinutes
                        ? `${formatDuration(current.durationMinutes)} · até ${addMinutesToTime(current.time, current.durationMinutes)}`
                        : 'Sem duração'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-1" align="end">
                    {DURATION_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          emit({ ...current, durationMinutes: p.minutes });
                          setDurationMenuOpen(false);
                        }}
                        className={cn(
                          'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between',
                          (current.durationMinutes ?? null) === p.minutes && 'bg-muted text-primary font-medium'
                        )}
                      >
                        <span>{p.label}</span>
                        {p.minutes && current.time && (
                          <span className="text-[10px] text-muted-foreground">
                            até {addMinutesToTime(current.time, p.minutes)}
                          </span>
                        )}
                      </button>
                    ))}
                    <div className="my-1 border-t border-border" />
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-[10px] text-muted-foreground">Outro:</span>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        placeholder="min"
                        value={current.durationMinutes && !DURATION_PRESETS.some(p => p.minutes === current.durationMinutes) ? current.durationMinutes : ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          emit({ ...current, durationMinutes: Number.isFinite(n) && n > 0 ? n : null });
                        }}
                        className="h-6 text-xs"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <Popover open={recurrenceMenuOpen} onOpenChange={setRecurrenceMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border transition-colors',
                    current.recurrenceRule
                      ? 'border-accent/40 text-accent bg-accent/5'
                      : 'border-border text-muted-foreground hover:border-accent/40'
                  )}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  {currentRecurrenceLabel || 'Repetir'}
                  {current.recurrenceRule && (
                    <X
                      className="h-3 w-3 ml-auto"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        emit({ ...current, recurrenceRule: null });
                      }}
                    />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-1" align="end">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      emit({ ...current, recurrenceRule: p.build() });
                      setRecurrenceMenuOpen(false);
                    }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                  >
                    {p.label}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => {
                    setRecurrenceMenuOpen(false);
                    setCustomOpen(true);
                  }}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                >
                  Personalizar…
                </button>
                {current.recurrenceRule && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        emit({ ...current, recurrenceRule: null });
                        setRecurrenceMenuOpen(false);
                      }}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
                    >
                      Remover recorrência
                    </button>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>
          </div>
          <div className="flex gap-2 p-2 border-t border-border bg-popover shrink-0 sticky bottom-0">
            {hasCurrentValue && (
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 h-8 text-xs"
                onClick={() => {
                  emit({ date: undefined, time: undefined, recurrenceRule: null });
                }}
              >
                Limpar
              </Button>
            )}
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => handleOpenChange(false)}>
              <Check className="h-3 w-3 mr-1" /> OK
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <RecurrenceCustomDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        initialRule={current.recurrenceRule}
        startDate={current.date}
        onSave={(rule) => emit({ ...current, recurrenceRule: rule })}
      />
    </>
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
