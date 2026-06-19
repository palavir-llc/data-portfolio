"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { escapeHtml } from "@/lib/html";

export interface RoiPoint {
  id: string;
  label: string;       // school name
  earn: number | null; // 5yr median earnings
  debt: number | null; // median debt
  payoff: number | null;
  suppressed?: boolean;
}

interface RoiScatterProps {
  data: RoiPoint[];
  width?: number;
  height?: number;
  highlightId?: string | null;
  onHover?: (id: string | null) => void;
}

/**
 * Earnings (x) vs debt (y) scatter for every school offering a major. Each dot is a
 * real College Scorecard program; points whose earnings were privacy-suppressed are
 * never invented — they are reported separately, not plotted. Colour encodes the
 * (disclosed-formula) years-to-pay-off-debt.
 */
export function RoiScatter({
  data,
  width = 760,
  height = 460,
  highlightId,
  onHover,
}: RoiScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    type Plotted = { id: string; label: string; earn: number; debt: number | null; payoff: number | null };
    const points: Plotted[] = data
      .filter((d) => d.earn != null && !d.suppressed)
      .map((d) => ({ id: d.id, label: d.label, earn: d.earn as number, debt: d.debt, payoff: d.payoff }));
    if (points.length === 0) return;

    const margin = { top: 24, right: 24, bottom: 52, left: 76 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const g = svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, (d3.max(points, (d) => d.earn) as number) * 1.05])
      .range([0, w]);
    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(points, (d) => d.debt ?? 0) as number) * 1.05 || 1])
      .range([h, 0]);
    const color = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([d3.max(points, (d) => d.payoff ?? 0) as number, 0]); // low payoff = bright

    // axes
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `$${d3.format("~s")(d as number)}`))
      .attr("color", "#888");
    g.append("g")
      .call(d3.axisLeft(y).ticks(6).tickFormat((d) => `$${d3.format("~s")(d as number)}`))
      .attr("color", "#888");

    g.append("text")
      .attr("x", w / 2).attr("y", h + 42).attr("text-anchor", "middle")
      .attr("fill", "#aaa").attr("font-size", 12)
      .text("Median earnings, 5 years after graduation");
    g.append("text")
      .attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", -58)
      .attr("text-anchor", "middle").attr("fill", "#aaa").attr("font-size", 12)
      .text("Median debt at graduation");

    g.selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d) => x(d.earn))
      .attr("cy", (d) => y(d.debt ?? 0))
      .attr("r", (d) => (d.id === highlightId ? 8 : 4))
      .attr("fill", (d) => (d.debt != null ? color(d.payoff ?? 0) : "#555"))
      .attr("stroke", (d) => (d.id === highlightId ? "#fff" : "none"))
      .attr("stroke-width", 2)
      .attr("opacity", (d) => (highlightId && d.id !== highlightId ? 0.45 : 0.9))
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip({
          x: mx,
          y: my,
          html: `<strong>${escapeHtml(d.label)}</strong><br/>5yr earnings: $${d.earn.toLocaleString()}<br/>${
            d.debt != null ? `Debt: $${d.debt.toLocaleString()}<br/>` : "Debt: not reported<br/>"
          }${d.payoff != null ? `~${d.payoff} yrs to pay off` : ""}`,
        });
        onHover?.(d.id);
      })
      .on("mouseleave", () => {
        setTooltip(null);
        onHover?.(null);
      });
  }, [data, width, height, highlightId, onHover]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full h-auto" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-100 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12, maxWidth: 240 }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
    </div>
  );
}
