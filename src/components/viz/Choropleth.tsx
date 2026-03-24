"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";

interface ChoroplethProps {
  data: Array<{
    state: string;
    state_fips: string;
    value: number;
    label?: string;
  }>;
  width?: number;
  height?: number;
  colorScheme?: "reds" | "blues" | "greens" | "oranges";
  valueFormat?: (v: number) => string;
  title?: string;
}

export function Choropleth({
  data,
  width = 960,
  height = 600,
  colorScheme = "reds",
  valueFormat = (v) => v.toFixed(1) + "%",
  title,
}: ChoroplethProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<any>(null);

  // Load US topology
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
      .then((r) => r.json())
      .then((us) => setGeo(us))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !geo || !data.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const stateMap = new Map(data.map((d) => [d.state_fips, d]));
    const values = data.map((d) => d.value);
    const maxVal = d3.max(values) || 1;

    const schemes: Record<string, readonly (readonly string[])[]> = {
      reds: d3.schemeReds as any,
      blues: d3.schemeBlues as any,
      greens: d3.schemeGreens as any,
      oranges: d3.schemeOranges as any,
    };

    const color = d3
      .scaleQuantize<string>()
      .domain([0, maxVal])
      .range((schemes[colorScheme]?.[7] || d3.schemeReds[7]) as string[]);

    const path = d3.geoPath(
      d3.geoAlbersUsa().fitSize([width, height - 40], topojson.feature(geo, geo.objects.states) as any)
    );

    const states = topojson.feature(geo, geo.objects.states) as any;

    // Draw states
    svg
      .append("g")
      .selectAll("path")
      .data(states.features)
      .join("path")
      .attr("d", path as any)
      .attr("fill", (d: any) => {
        const fips = String(d.id).padStart(2, "0");
        const row = stateMap.get(fips);
        return row ? color(row.value) : "#1e293b";
      })
      .attr("stroke", "#334155")
      .attr("stroke-width", 0.5)
      .attr("cursor", "pointer")
      .on("mouseover", function (event: MouseEvent, d: any) {
        d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1.5);
        const fips = String(d.id).padStart(2, "0");
        const row = stateMap.get(fips);
        const tooltip = tooltipRef.current;
        if (tooltip && row) {
          tooltip.style.display = "block";
          tooltip.style.left = event.offsetX + 12 + "px";
          tooltip.style.top = event.offsetY - 10 + "px";
          const barW = Math.min(Math.max(row.value / (maxVal || 1) * 120, 8), 120);
          tooltip.innerHTML = `
            <div style="min-width:180px">
              <strong style="font-size:13px">${row.label || row.state}</strong>
              <div style="margin:6px 0 4px;display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:#27272a;border-radius:3px">
                  <div style="width:${barW}px;height:6px;background:#ef4444;border-radius:3px"></div>
                </div>
                <span style="font-weight:bold;color:#ef4444">${valueFormat(row.value)}</span>
              </div>
            </div>`;
        }
      })
      .on("mousemove", function (event: MouseEvent) {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.left = event.offsetX + 12 + "px";
          tooltip.style.top = event.offsetY - 10 + "px";
        }
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke", "#334155").attr("stroke-width", 0.5);
        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = "none";
      });

    // Legend
    const legendW = 200;
    const legendH = 10;
    const legendX = width - legendW - 20;
    const legendY = height - 30;
    const legendScale = d3.scaleLinear().domain([0, maxVal]).range([0, legendW]);
    const legendAxis = d3.axisBottom(legendScale).ticks(4).tickFormat((d) => valueFormat(d as number));

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "legend-gradient");
    const colorRange = (schemes[colorScheme]?.[7] || d3.schemeReds[7]) as string[];
    colorRange.forEach((c: string, i: number) => {
      gradient
        .append("stop")
        .attr("offset", `${(i / (colorRange.length - 1)) * 100}%`)
        .attr("stop-color", c);
    });

    const lg = svg.append("g").attr("transform", `translate(${legendX},${legendY})`);
    lg.append("rect")
      .attr("width", legendW)
      .attr("height", legendH)
      .style("fill", "url(#legend-gradient)");
    lg.append("g")
      .attr("transform", `translate(0,${legendH})`)
      .call(legendAxis)
      .selectAll("text")
      .attr("fill", "#94a3b8")
      .attr("font-size", "9px");
    lg.selectAll(".domain, .tick line").attr("stroke", "#475569");
  }, [geo, data, width, height, colorScheme, valueFormat]);

  return (
    <div className="relative">
      {title && <p className="mb-2 text-sm font-medium text-zinc-300">{title}</p>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/40"
        style={{ maxHeight: 500 }}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-100 shadow-lg"
        style={{ display: "none" }}
      />
    </div>
  );
}
