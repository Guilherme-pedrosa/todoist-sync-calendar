import { useEffect, useState } from 'react';

/** The part of the page that remains visible above the mobile keyboard. */
export function useVisibleViewport(enabled: boolean) {
  const readViewport = () => ({
    top: window.visualViewport?.offsetTop ?? 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (!enabled) return;
    const update = () => setViewport(readViewport());
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return viewport;
}
