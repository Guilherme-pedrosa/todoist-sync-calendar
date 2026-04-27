import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-5">
        <div className="text-primary/60">{icon}</div>
      </div>
      <p className="font-display text-base font-semibold">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5 h-9">
          <Plus className="h-4 w-4 mr-1.5" />
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
