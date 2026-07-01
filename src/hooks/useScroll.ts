import { useRef, useCallback } from 'react';

export function useScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  const isNearBottom = useCallback((el: HTMLElement | null, threshold = 50) => {
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const el = containerRef.current;
      if (el && isNearBottom(el)) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [isNearBottom]);

  const forceScrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  return { containerRef, scrollToBottom, forceScrollToBottom };
}
