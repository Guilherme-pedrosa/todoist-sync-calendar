import { useEffect, useRef, type RefObject } from 'react';

type TouchPoint = { clientX: number; clientY: number };

/** Keep ordinary calendar scrolling native; only a deliberate hold owns a drag. */
export function useAgendaTouchGesture<T extends HTMLElement>(
  elementRef: RefObject<T>,
  {
    onTap,
    onStartDrag,
    onlyEmpty = false,
  }: {
    onTap: (point: TouchPoint) => void;
    onStartDrag?: (start: TouchPoint, current: TouchPoint) => void;
    onlyEmpty?: boolean;
  },
) {
  const callbacks = useRef({ onTap, onStartDrag, onlyEmpty });
  callbacks.current = { onTap, onStartDrag, onlyEmpty };

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let gesture: { start: TouchPoint; armed: boolean; dragging: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      gesture = null;
    };
    const onStart = (event: TouchEvent) => {
      clear();
      if (event.touches.length !== 1) return;
      if (callbacks.current.onlyEmpty && event.target !== element) return;
      if (event.target instanceof Element && event.target.closest('[data-agenda-control]')) return;
      const touch = event.touches[0];
      gesture = {
        start: { clientX: touch.clientX, clientY: touch.clientY },
        armed: false,
        dragging: false,
      };
      if (callbacks.current.onStartDrag) {
        timer = setTimeout(() => {
          if (gesture) gesture.armed = true;
        }, 400);
      }
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      if (event.touches.length !== 1) {
        clear();
        return;
      }
      const distance = Math.hypot(touch.clientX - gesture.start.clientX, touch.clientY - gesture.start.clientY);
      if (!gesture.armed) {
        if (distance > 8) clear();
        return;
      }
      if (!gesture.dragging && distance <= 4) return;
      // React delegates touchmove passively. A native non-passive listener is
      // needed here for iOS/Chrome to hand the held gesture to the calendar.
      if (event.cancelable) event.preventDefault();
      if (!gesture.dragging) {
        gesture.dragging = true;
        callbacks.current.onStartDrag?.(gesture.start, { clientX: touch.clientX, clientY: touch.clientY });
      }
    };
    const onEnd = (event: TouchEvent) => {
      const finished = gesture;
      clear();
      if (!finished || finished.dragging) return;
      // Avoid the compatibility click reaching the editor opened by this tap.
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      callbacks.current.onTap(finished.start);
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd, { passive: false });
    element.addEventListener('touchcancel', clear);
    return () => {
      clear();
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', clear);
    };
  }, [elementRef]);
}
