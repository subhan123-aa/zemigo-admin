import React, { useMemo, useState } from 'react';

import { ChevronDownSmallIcon } from '@/components/icons/AdminIcons';
import type { SalesOverviewPoint, SalesRangeKey } from '@/types/admin';
import { formatINR } from '@/utils/formatters';

export interface SalesOverviewChartProps {
  points: SalesOverviewPoint[];
  range: SalesRangeKey;
  onChangeRange: (range: SalesRangeKey) => void;
  loading?: boolean;
}

const RANGE_OPTIONS: { value: SalesRangeKey; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '14d', label: 'Last 14 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

function computeNiceMax(maxValue: number): number {
  if (maxValue <= 0) return 500000;
  const roughStep = maxValue / 4.3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceStep = magnitude;
  if (residual > 5) niceStep = 10 * magnitude;
  else if (residual > 2) niceStep = 5 * magnitude;
  else if (residual > 1) niceStep = 2 * magnitude;
  return niceStep * 5;
}

function buildSmoothSvgPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const SalesOverviewChart: React.FC<SalesOverviewChartProps> = ({
  points,
  range,
  onChangeRange,
  loading = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const svgWidth = 620;
  const svgHeight = 236;
  const padLeft = 78;
  const padRight = 28;
  const padTop = 34;
  const padBottom = 34;

  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const { yMax, yTicks, coords, linePath, areaPath, activeIdx } = useMemo(() => {
    const maxPoint = points.reduce((acc, p) => Math.max(acc, p.sales), 0);
    const computedMax = computeNiceMax(maxPoint);
    const step = computedMax / 5;
    const ticks = [5, 4, 3, 2, 1, 0].map((idx) => idx * step);

    const mapped = points.map((p, index) => {
      const ratioX =
        points.length <= 1 ? 0.5 : index / (points.length - 1);
      const x = padLeft + ratioX * plotWidth;
      const clampedY = Math.min(computedMax, Math.max(0, p.sales));
      const y =
        padTop + plotHeight - (clampedY / computedMax) * plotHeight;
      return { x, y, point: p };
    });

    const strokeD = buildSmoothSvgPath(mapped);
    const baselineY = padTop + plotHeight;
    const fillD =
      mapped.length > 1
        ? `${strokeD} L ${mapped[mapped.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${mapped[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
        : '';

    const defaultCalloutIndex =
      hoveredIndex !== null
        ? hoveredIndex
        : mapped.length > 0
          ? mapped.length - 1
          : null;

    return {
      yMax: computedMax,
      yTicks: ticks,
      coords: mapped,
      linePath: strokeD,
      areaPath: fillD,
      activeIdx: defaultCalloutIndex,
    };
  }, [points, plotWidth, plotHeight, hoveredIndex]);

  const xLabelStride =
    points.length > 16 ? 5 : points.length > 9 ? 2 : 1;

  return (
    <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 sm:p-6 flex flex-col justify-between">
      {/* Header + Range Selector */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[18px] font-bold text-[#111827] tracking-tight">
          Sales Overview
        </h2>

        <div className="relative">
          <select
            aria-label="Sales overview date range"
            value={range}
            onChange={(e) => onChangeRange(e.target.value as SalesRangeKey)}
            className="appearance-none bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-lg pl-3.5 pr-8 py-1.5 text-[13px] font-medium text-[#1F2937] focus:outline-none focus:border-[#16A34A] cursor-pointer"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDownSmallIcon className="w-3.5 h-3.5 text-[#4B5563] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Responsive SVG Area & Line Chart */}
      {loading ? (
        <div className="h-[220px] w-full rounded-xl bg-gray-50 animate-pulse" />
      ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto min-w-[460px] select-none"
            role="img"
            aria-label="Sales overview line chart"
          >
            <defs>
              <linearGradient
                id="zemigoSalesAreaGradient"
                x1="0"
                y1={padTop}
                x2="0"
                y2={padTop + plotHeight}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#16A34A" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#16A34A" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal Y-Axis Gridlines & Currency Tick Labels */}
            {yTicks.map((tickVal) => {
              const y =
                padTop + plotHeight - (tickVal / yMax) * plotHeight;
              return (
                <g key={tickVal}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="#F3F4F6"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[#6B7280] text-[11px] font-normal"
                  >
                    {formatINR(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* Soft Green Gradient Area Fill */}
            {areaPath ? (
              <path d={areaPath} fill="url(#zemigoSalesAreaGradient)" />
            ) : null}

            {/* Smooth Green Sales Curve */}
            {linePath ? (
              <path
                d={linePath}
                fill="none"
                stroke="#16A34A"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {/* X-Axis Labels & Data Point Dots */}
            {coords.map((c, idx) => {
              const showLabel =
                idx % xLabelStride === 0 || idx === coords.length - 1;
              return (
                <g key={c.point.dateKey}>
                  {showLabel ? (
                    <text
                      x={c.x}
                      y={padTop + plotHeight + 22}
                      textAnchor="middle"
                      className="fill-[#374151] text-[11.5px] font-medium"
                    >
                      {c.point.label}
                    </text>
                  ) : null}

                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={hoveredIndex === idx ? 5.5 : 4.2}
                    fill="#FFFFFF"
                    stroke="#16A34A"
                    strokeWidth={2.2}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                </g>
              );
            })}

            {/* Floating Green Value Callout Pill */}
            {activeIdx !== null && coords[activeIdx] ? (
              (() => {
                const activeCoord = coords[activeIdx];
                const labelText = formatINR(activeCoord.point.sales);
                const pillWidth = Math.max(66, labelText.length * 7.6 + 16);
                const pillHeight = 23;
                const clampedX = Math.min(
                  svgWidth - pillWidth / 2 - 6,
                  Math.max(padLeft + pillWidth / 2, activeCoord.x)
                );
                const pillY = Math.max(6, activeCoord.y - 31);

                return (
                  <g className="pointer-events-none">
                    <rect
                      x={clampedX - pillWidth / 2}
                      y={pillY}
                      width={pillWidth}
                      height={pillHeight}
                      rx={11.5}
                      fill="#16A34A"
                    />
                    <text
                      x={clampedX}
                      y={pillY + 15.2}
                      textAnchor="middle"
                      className="fill-white text-[11.5px] font-bold"
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })()
            ) : null}
          </svg>
        </div>
      )}
    </div>
  );
};
