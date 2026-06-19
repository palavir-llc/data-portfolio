"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Counts up to `value` once it scrolls into view (ease-out). Pure React —
 * IntersectionObserver + requestAnimationFrame, no animation library.
 */
export function AnimatedCounter({
  value,
  durationMs = 1400,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            setDisplay(value * eased);
            if (t < 1) requestAnimationFrame(tick);
            else setDisplay(value);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
}
