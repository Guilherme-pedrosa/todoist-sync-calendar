import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}
interface State {
  error: Error | null;
}

export class AIAssistantErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[AIAssistantPanel] crash isolado:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div className="space-y-1">
            <h3 className="font-display text-base">Algo travou no Assistente</h3>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              {this.state.error.message || 'Erro inesperado renderizando o painel.'}
            </p>
          </div>
          <Button size="sm" onClick={this.reset}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
