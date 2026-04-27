import { useEffect, useRef } from 'react';

/**
 * Executa `fn` `delay`ms após `deps` parar de mudar.
 * Não roda na primeira renderização para evitar salvar valores iniciais.
 */
export function useDebouncedEffect(fn: () => void, deps: any[], delay = 500) {
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(fn, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
