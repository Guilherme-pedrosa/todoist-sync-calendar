import { useEffect } from 'react';

export function usePreventPullToRefresh() {
  useEffect(() => {
    // Evita o pull-to-refresh nativo do Chrome/Safari no mobile,
    // que causa o recarregamento da página e perda de estado de drag.
    document.body.style.overscrollBehaviorY = 'none';
    
    // Prevenção agressiva de scroll quando em drag (via CSS class no body se necessário)
    return () => {
      document.body.style.overscrollBehaviorY = 'auto';
    };
  }, []);
}
