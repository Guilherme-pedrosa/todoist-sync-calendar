import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  show: boolean;
  onChange: (v: boolean) => void;
  count?: number;
  className?: string;
}

export function ShowCompletedToggle({ show, onChange, count, className }: Props) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => onChange(!show)}
      className={cn('h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground', className)}
      title={show ? 'Esconder concluídas' : 'Mostrar concluídas'}
    >
      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">
        {show ? 'Esconder concluídas' : 'Mostrar concluídas'}
      </span>
      {typeof count === 'number' && count > 0 && (
        <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {count}
        </span>
      )}
    </Button>
  );
}
