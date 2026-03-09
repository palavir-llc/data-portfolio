"use client";

import { useRef, useEffect } from "react";
import * as d3 from "d3";

interface RidgePlotData {
  label: string;
  values: number[];
  color?: string;
}

interface RidgePlotProps {
  data: RidgePlotData[];
  width?: number;
  height?: number;
  overlap?: number;
  title?: string;
  xLabel?: string;
}

export function RidgePlot({
  data,
  width = 800,
  height = 400,
  overlap = 0.7,
  title,
  xLabel,
}: RidgePlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 30, bottom: 40, left: 120 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const allValues = data.flatMap((d) => d.values);
    const sorted = [...allValues].sort(d3.ascending);
    const xScale = d3
      .scaleLinear()
      .domain([
        d3.quantile(sorted, 0.01) ?? 0,
        d3.quantile(sorted, 0.99) ?? 100,
      ])
      .range([0, w]);

    const rowHeight = h / data.length;
    const yScale = d3
      .scaleBand<string>()
      .domain(data.map((d) => d.label))
      .range([0, h])
      .padding(0);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.label))
      .range(d3.schemeTableau10);

    function kde(
      kernel: (v: number) => number,
      thresholds: number[],
      values: number[]
    ) {
      return thresholds.map((t) => [
        t,
        d3.mean(values, (v) => kernel(t - v)) ?? 0,
      ]);
    }

    function epanechnikov(bw: number) {
      return (v: number) =>
        Math.abs((v /= bw)) <= 1 ? (0.75 * (1 - v * v)) / bw : 0;
    }

    const bw = (xScale.domain()[1] - xScale.domain()[0]) / 20;
    const thresholds = xScale.ticks(80);

    data.forEach((d) => {
      const density = kde(epanechnikov(bw), thresholds, d.values);
      const maxDensity = d3.max(density, (p) => p[1]) ?? 1;
      const areaScale = d3
        .scaleLinear()
        .domain([0, maxDensity])
        .range([0, rowHeight * (1 + overlap)]);

      const yPos = yScale(d.label) ?? 0;
      const area = d3
        .area<[number, number]>()
        .x((p) => xScale(p[0]))
        .y0(yPos + rowHeight)
        .y1((p) => yPos + rowHeight - areaScale(p[1]))
        .curve(d3.curveBasis);

      const color = d.color ?? colorScale(d.label);

      g.append("path")
        .datum(density as [number, number][])
        .attr("fill", color)
        .attr("fill-opacity", 0.6)
        .attr("d", area);

      g.append("path")
        .datum(density as [number, number][])
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("d", area);
    });

    g.append("g")
      .call(
        d3
          .axisLeft(yScale)
          .tickSize(0)
          .tickFormat((d) =>
            String(d).length > 15 ? String(d).slice(0, 15) + "..." : String(d)
          )
      )
      .select(".domain")
      .remove();
    g.selectAll(".tick text").attr("fill", "#a1a1aa").attr("font-size", "11px");

    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .selectAll("text")
      .attr("fill", "#a1a1aa");

    g.selectAll(".domain").attr("stroke", "#3f3f46");
    g.selectAll(".tick line").attr("stroke", "#3f3f46");

    if (xLabel) {
      g.append("text")
        .attr("x", w / 2)
        .attr("y", h + 35)
        .attr("text-anchor", "middle")
        .attr("fill", "#71717a")
        .attr("font-size", "12px")
        .text(xLabel);
    }

    if (title) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("fill", "#e4e4e7")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text(title);
    }
  }, [data, width, height, overlap, title, xLabel]);

  return <svg ref={svgRef} className="w-full" />;
}
