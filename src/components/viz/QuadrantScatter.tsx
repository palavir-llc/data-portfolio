"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { escapeHtml } from "@/lib/html";

export interface QuadrantPoint {
  cip4: string;
  title: string;
  earn: number | null; // 5yr earnings (x)
  ai: number | null; // AI exposure beta (y)
  n: number;
}

interface QuadrantScatterProps {
  data: QuadrantPoint[];
  width?: number;
  height?: number;
  xMid?: number; // median earnings divider
  highlight?: string | null; // cip4 to emphasize
}

/**
 * Every Bachelor's major placed by pay (x) and generative-AI task exposure (y),
 * split into four quadrants. The top-right is the "danger zone": well paid AND highly
 * exposed. Real values from College Scorecard + the AI-exposure measures.
 */
export function QuadrantScatter({
  data,
  width = 860,
  height = 560,
  xMid,
  highlight,
}: QuadrantScatterProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    type P = { cip4: string; title: string; earn: number; ai: number; n: number };
    const pts: P[] = data
      .filter((d) => d.earn != null && d.ai != null)
      .map((d) => ({ cip4: d.cip4, title: d.title, earn: d.earn as number, ai: d.ai as number, n: d.n }));
    if (!pts.length) return;

    const m = { top: 30, right: 24, bottom: 52, left: 64 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const g = svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scaleLinear().domain([d3.min(pts, (d) => d.earn)! * 0.9, d3.max(pts, (d) => d.earn)! * 1.05]).range([0, w]);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(pts, (d) => d.ai)! * 1.05)]).range([h, 0]);
    const xm = xMid ?? d3.median(pts, (d) => d.earn)!;
    const ym = 0.5;

    // quadrant backgrounds
    const quads = [
      { x0: xm, x1: x.domain()[1], y0: ym, y1: y.domain()[1], fill: "#f43f5e" }, // hi pay hi ai - danger
      { x0: xm, x1: x.domain()[1], y0: 0, y1: ym, fill: "#10b981" }, // hi pay lo ai - safe lucrative
      { x0: x.domain()[0], x1: xm, y0: ym, y1: y.domain()[1], fill: "#f59e0b" }, // lo pay hi ai
      { x0: x.domain()[0], x1: xm, y0: 0, y1: ym, fill: "#64748b" }, // lo pay lo ai
    ];
    g.selectAll("rect.q")
      .data(quads)
      .join("rect")
      .attr("class", "q")
      .attr("x", (d) => x(d.x0))
      .attr("y", (d) => y(d.y1))
      .attr("width", (d) => x(d.x1) - x(d.x0))
      .attr("height", (d) => y(d.y0) - y(d.y1))
      .attr("fill", (d) => d.fill)
      .attr("opacity", 0.06);

    // divider lines
    g.append("line").attr("x1", x(xm)).attr("x2", x(xm)).attr("y1", 0).attr("y2", h)
      .attr("stroke", "#555").attr("stroke-dasharray", "4 4");
    g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(ym)).attr("y2", y(ym))
      .attr("stroke", "#555").attr("stroke-dasharray", "4 4");

    // quadrant labels
    const labels = [
      { x: x.domain()[1], y: y.domain()[1], t: "AI danger zone", c: "#fb7185", anchor: "end", dy: 14 },
      { x: x.domain()[1], y: 0.04, t: "Safe & lucrative", c: "#34d399", anchor: "end", dy: -6 },
      { x: x.domain()[0], y: y.domain()[1], t: "Exposed & underpaid", c: "#fbbf24", anchor: "start", dy: 14 },
      { x: x.domain()[0], y: 0.04, t: "Low risk, low reward", c: "#94a3b8", anchor: "start", dy: -6 },
    ];
    g.selectAll("text.ql")
      .data(labels)
      .join("text")
      .attr("class", "ql")
      .attr("x", (d) => x(d.x) + (d.anchor === "end" ? -8 : 8))
      .attr("y", (d) => y(d.y) + d.dy)
      .attr("text-anchor", (d) => d.anchor)
      .attr("fill", (d) => d.c)
      .attr("font-size", 12)
      .attr("font-weight", 600)
      .text((d) => d.t);

    // axes
    g.append("g").attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `$${d3.format("~s")(d as number)}`))
      .attr("color", "#888");
    g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${Math.round((d as number) * 100)}%`))
      .attr("color", "#888");
    g.append("text").attr("x", w / 2).attr("y", h + 42).attr("text-anchor", "middle")
      .attr("fill", "#aaa").attr("font-size", 12).text("Median earnings, 5 years out →");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", -48)
      .attr("text-anchor", "middle").attr("fill", "#aaa").attr("font-size", 12)
      .text("AI task exposure →");

    const color = (d: P) =>
      d.earn >= xm ? (d.ai >= ym ? "#f43f5e" : "#10b981") : d.ai >= ym ? "#f59e0b" : "#64748b";

    g.selectAll("circle")
      .data(pts)
      .join("circle")
      .attr("cx", (d) => x(d.earn))
      .attr("cy", (d) => y(d.ai))
      .attr("r", (d) => (d.cip4 === highlight ? 8 : Math.max(3, Math.sqrt(d.n) / 2)))
      .attr("fill", (d) => (d.cip4 === highlight ? "#fff" : color(d)))
      .attr("stroke", (d) => (d.cip4 === highlight ? "#a855f7" : "none"))
      .attr("stroke-width", 3)
      .attr("opacity", 0.82)
      .style("cursor", "pointer")
      .on("mousemove", (e, d) => {
        const [mx, my] = d3.pointer(e, ref.current);
        setTip({
          x: mx, y: my,
          html: `<strong>${escapeHtml(d.title)}</strong><br/>$${d.earn.toLocaleString()} · AI ${Math.round(d.ai * 100)}%`,
        });
      })
      .on("mouseleave", () => setTip(null));

    // label a handful of notable majors
    const notable = [...pts].sort((a, b) => b.earn * b.ai - a.earn * a.ai).slice(0, 5);
    g.selectAll("text.lbl")
      .data(notable)
      .join("text")
      .attr("class", "lbl")
      .attr("x", (d) => x(d.earn) + 7)
      .attr("y", (d) => y(d.ai) - 6)
      .attr("fill", "#ddd")
      .attr("font-size", 10)
      .text((d) => d.title.split(",")[0].slice(0, 22));
  }, [data, width, height, xMid, highlight]);

  return (
    <div className="relative">
      <svg ref={ref} className="w-full h-auto" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-100 shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12, maxWidth: 240 }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      )}
    </div>
  );
}
