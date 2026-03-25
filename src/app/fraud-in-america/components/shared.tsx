"use client";

import { useEffect, useRef, useState } from "react";

// ─── Dollar formatter ────────────────────────────────────────────────
export function $(n: number): string {
  if (Math.abs(n) >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

// ─── Stat Card ───────────────────────────────────────────────────────
export function Stat({ value, label, sub, accent }: {
  value: string; label: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ─── Comparison (side-by-side with multiplier) ───────────────────────
export function Comparison({ left, right, leftLabel, rightLabel, multiplier, description }: {
  left: string; right: string; leftLabel: string; rightLabel: string;
  multiplier: string; description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="mb-3 text-xs text-zinc-500">{description}</p>
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <p className="text-xs text-zinc-500">{leftLabel}</p>
          <p className="text-xl font-bold text-zinc-300">{left}</p>
        </div>
        <div className="flex-shrink-0 rounded-full bg-red-500/20 px-3 py-1">
          <span className="text-sm font-bold text-red-400">{multiplier}</span>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs text-zinc-500">{rightLabel}</p>
          <p className="text-xl font-bold text-red-400">{right}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Why Box ─────────────────────────────────────────────────────────
export function WhyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border-l-4 border-amber-500 bg-amber-500/5 px-5 py-4">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-400">Why this matters</p>
      <p className="text-sm leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}

// ─── Case File ───────────────────────────────────────────────────────
export function CaseFile({ title, items, color = "red" }: {
  title: string;
  items: Array<{ label: string; detail: string; amount?: string }>;
  color?: "red" | "amber" | "violet";
}) {
  const bc = { red: "border-red-500/40", amber: "border-amber-500/40", violet: "border-violet-500/40" };
  const dc = { red: "bg-red-400", amber: "bg-amber-400", violet: "bg-violet-400" };
  return (
    <div className={`rounded-xl border ${bc[color]} bg-zinc-900/60 p-5`}>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">{title}</h4>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dc[color]}`} />
            <div>
              <p className="text-sm font-medium text-zinc-200">{item.label}</p>
              <p className="text-xs text-zinc-500">{item.detail}</p>
              {item.amount && <p className="text-xs font-bold text-zinc-400">{item.amount}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Source Attribution ──────────────────────────────────────────────
export function Source({ text, url }: { text: string; url?: string }) {
  return (
    <p className="mt-6 text-[11px] text-zinc-600">
      Source:{" "}{url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">{text}</a>
      ) : text}
    </p>
  );
}

// ─── Section Divider ─────────────────────────────────────────────────
export function SectionDivider() {
  return <div className="mx-auto my-0 h-px w-full bg-zinc-800" />;
}

// ─── Animated Number (scroll-triggered) ──────────────────────────────
export function AnimatedNumber({ value, prefix = "", suffix = "", duration = 1500 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const animate = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(value * eased));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{prefix}{display.toLocaleString()}{suffix}</span>;
}

// ─── Animated Bar (scroll-triggered) ─────────────────────────────────
export function AnimatedBar({ label, value, maxValue, color = "#ef4444", fmt }: {
  label: string; value: number; maxValue: number; color?: string;
  fmt?: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setWidth((value / maxValue) * 100);
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, maxValue]);

  return (
    <div ref={ref} className="flex items-center gap-3">
      <span className="w-40 text-right text-[11px] text-zinc-400 truncate">{label}</span>
      <div className="relative flex-1 h-6 rounded bg-zinc-800/50">
        <div className="h-6 rounded transition-all duration-1000 ease-out"
          style={{ width: `${Math.max(width, 0.5)}%`, backgroundColor: color }} />
      </div>
      <span className="w-48 text-right font-mono text-[11px] text-zinc-300 truncate">
        {fmt ? fmt(value) : value.toFixed(1)}
      </span>
    </div>
  );
}

// ─── Interactive Timeline ────────────────────────────────────────────
export function Timeline({ data, color = "#3b82f6", label, fmt }: {
  data: Array<{ month: string; total: number }>; color?: string; label?: string;
  fmt?: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length) return null;
  const maxV = Math.max(...data.map((d) => d.total), 1);
  const cw = 100;

  function handleMouse(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(Math.round(relX * (data.length - 1)), data.length - 1)));
  }

  const hData = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 relative">
      {label && <p className="mb-3 text-xs font-medium text-zinc-400">{label}</p>}
      <svg viewBox={`0 0 ${cw} 100`} preserveAspectRatio="none" className="w-full" style={{ height: 200 }}
        onMouseMove={handleMouse} onMouseLeave={() => setHoverIdx(null)}>
        <polyline fill={color} fillOpacity="0.1" stroke="none"
          points={`0,100 ${data.map((d, i) => `${(i / (data.length - 1)) * cw},${100 - (d.total / maxV) * 85}`).join(" ")} ${cw},100`} />
        <polyline fill="none" stroke={color} strokeWidth="0.3"
          points={data.map((d, i) => `${(i / (data.length - 1)) * cw},${100 - (d.total / maxV) * 85}`).join(" ")} />
        {hoverIdx !== null && (
          <>
            <line x1={(hoverIdx / (data.length - 1)) * cw} y1="0"
              x2={(hoverIdx / (data.length - 1)) * cw} y2="100"
              stroke="#71717a" strokeWidth="0.2" strokeDasharray="1,1" />
            <circle cx={(hoverIdx / (data.length - 1)) * cw}
              cy={100 - (data[hoverIdx].total / maxV) * 85}
              r="1.2" fill={color} stroke="white" strokeWidth="0.3" />
          </>
        )}
      </svg>
      {hData && hoverIdx !== null && (
        <div className="pointer-events-none absolute z-50 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-xl text-xs backdrop-blur-sm"
          style={{ left: `${Math.min(Math.max((hoverIdx / (data.length - 1)) * 100, 10), 80)}%`, top: 30 }}>
          <p className="font-bold text-zinc-200">{hData.month}</p>
          <p style={{ color }}>{fmt ? fmt(hData.total) : hData.total.toLocaleString()}</p>
        </div>
      )}
      <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
        <span>{data[0]?.month}</span>
        {fmt && <span className="text-zinc-400">Peak: {fmt(maxV)}</span>}
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HBar({ data, labelKey, valueKey, color = "#f97316", max = 15, fmt }: {
  data: any[]; labelKey: string; valueKey: string; color?: string; max?: number;
  fmt?: (v: number) => string;
}) {
  const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]).slice(0, max);
  const peak = Math.max(...sorted.map((d) => d[valueKey]), 0.001);
  return (
    <div className="space-y-1.5">
      {sorted.map((d, i) => {
        const v = d[valueKey] as number;
        return (
          <div key={i} className="group flex items-center gap-2">
            <span className="w-44 truncate text-right text-[11px] text-zinc-400">{String(d[labelKey])}</span>
            <div className="relative flex-1 h-5">
              <div className="absolute inset-y-0 left-0 rounded-sm transition-all group-hover:brightness-125"
                style={{ width: `${Math.max((v / peak) * 100, 0.5)}%`, backgroundColor: color }} />
            </div>
            <span className="w-16 text-right font-mono text-[11px] text-zinc-300">
              {fmt ? fmt(v) : v.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
