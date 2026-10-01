"use client";

import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "../cn.js";

// Registered once, at module scope, with only the pieces used. The full ECharts
// bundle is several hundred kilobytes and none of the rest is wanted here.
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export interface TimeseriesPoint {
  t: number;
  v: number;
}

export interface TimeseriesSeries {
  key: string;
  label: string;
  points: readonly TimeseriesPoint[];
  /** Index into the chart palette, 1 to 6. */
  colorIndex?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TimeseriesProps {
  series: readonly TimeseriesSeries[];
  height?: number;
  unit?: string;
  /** Draws warn and crit lines, matching the app's health descriptor. */
  thresholds?: { warn?: number; crit?: number };
  className?: string;
}

/**
 * The single ECharts wrapper. Every interactive chart in GControl goes through it,
 * so theming, tooltips and axis behaviour are decided once. Colours are read from
 * the CSS tokens at mount, which is what keeps charts honest across light and dark.
 */
export function Timeseries({ series, height = 200, unit, thresholds, className }: TimeseriesProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const option = useMemo<EChartsOption>(() => {
    const css = (name: string, fallback: string): string => {
      if (typeof window === "undefined") return fallback;
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value.length > 0 ? value : fallback;
    };

    const axis = css("--gc-chart-axis", "#7b7f8a");
    const grid = css("--gc-chart-grid", "rgba(255,255,255,0.07)");
    const fg = css("--gc-text-primary", "#f4f5f7");
    const surface = css("--gc-surface-overlay", "#22252b");

    const markLines = [
      ...(thresholds?.warn === undefined
        ? []
        : [
            {
              yAxis: thresholds.warn,
              lineStyle: { color: css("--gc-warn", "#e0a33a"), type: "dashed" as const },
            },
          ]),
      ...(thresholds?.crit === undefined
        ? []
        : [
            {
              yAxis: thresholds.crit,
              lineStyle: { color: css("--gc-crit", "#e5484d"), type: "dashed" as const },
            },
          ]),
    ];

    return {
      animationDuration: 220,
      grid: { top: 12, right: 12, bottom: 20, left: 44, containLabel: false },
      tooltip: {
        trigger: "axis",
        backgroundColor: surface,
        borderColor: grid,
        borderWidth: 1,
        textStyle: { color: fg, fontSize: 12, fontFamily: "var(--font-mono)" },
        axisPointer: { type: "line", lineStyle: { color: grid } },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        axisLabel: { color: axis, fontSize: 10, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: axis,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          formatter: unit === undefined ? "{value}" : `{value} ${unit}`,
        },
        splitLine: { lineStyle: { color: grid } },
      },
      series: series.map((s, i) => ({
        type: "line",
        name: s.label,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: {
          width: 1.5,
          color: css(`--gc-chart-${s.colorIndex ?? (i % 6) + 1}`, "#5ac8e0"),
        },
        areaStyle: {
          opacity: 0.12,
          color: css(`--gc-chart-${s.colorIndex ?? (i % 6) + 1}`, "#5ac8e0"),
        },
        data: s.points.map((p) => [p.t, p.v]),
        ...(i === 0 && markLines.length > 0
          ? { markLine: { symbol: "none", silent: true, data: markLines, label: { show: false } } }
          : {}),
      })),
    };
  }, [series, unit, thresholds]);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Option changes are applied by the effect below; this one owns the instance.
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: false });
  }, [option]);

  return <div ref={ref} className={cn("w-full", className)} style={{ height }} />;
}
