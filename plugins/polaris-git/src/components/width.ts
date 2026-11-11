/**
 * 容器宽度观察（spec §3.2）：必须观察插件实际容器（ResizeObserver），
 * 禁止只看 window.innerWidth。宽度切换不丢状态（hook 只产出模式值）。
 */
import { useEffect, useRef, useState } from 'react';

export type WidthMode = 'narrow' | 'regular' | 'wide';

export function widthMode(px: number): WidthMode {
  if (px < 280) return 'narrow';
  if (px < 420) return 'regular';
  return 'wide';
}

export function useContainerWidth(): {
  ref: React.RefObject<HTMLDivElement>;
  width: number;
  mode: WidthMode;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width, mode: width === 0 ? 'regular' : widthMode(width) };
}
