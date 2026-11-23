import React from 'react';

import type { OrderStatusSlice } from '@/types/admin';
import { formatIndianNumber } from '@/utils/formatters';

export interface OrderStatusChartProps {
  slices: OrderStatusSlice[];
  totalOrders: number;
  loading?: boolean;
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M',
    outerStart.x.toFixed(2),
    outerStart.y.toFixed(2),
    'A',
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    outerEnd.x.toFixed(2),
    outerEnd.y.toFixed(2),
    'L',
    innerEnd.x.toFixed(2),
    innerEnd.y.toFixed(2),
    'A',
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerStart.x.toFixed(2),
    innerStart.y.toFixed(2),
    'Z',
  ].join(' ');
}

export const OrderStatusChart: React.FC<OrderStatusChartProps> = ({
  slices,
  totalOrders,
  loading = false,
}) => {
  const nonZeroSlices = slices.filter((s) => s.count > 0);
  const size = 172;
  const center = size / 2;
  const outerRadius = 78;
  const innerRadius = 50;

  let runningAngle = 0;

  return (
    <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 sm:p-6 flex flex-col justify-between">
      <h2 className="text-[18px] font-bold text-[#111827] tracking-tight">
        Order Status
      </h2>

      {loading ? (
        <div className="h-[196px] w-full rounded-xl bg-gray-50 animate-pulse mt-4" />
      ) : (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-6 my-auto">
          {/* Doughnut Chart with Center Count */}
          <div className="relative w-[168px] h-[168px] shrink-0 flex items-center justify-center">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full h-full"
              role="img"
              aria-label="Order status doughnut chart"
            >
              {totalOrders === 0 || nonZeroSlices.length === 0 ? (
                <circle
                  cx={center}
                  cy={center}
                  r={(outerRadius + innerRadius) / 2}
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth={outerRadius - innerRadius}
                />
              ) : nonZeroSlices.length === 1 ? (
                <circle
                  cx={center}
                  cy={center}
                  r={(outerRadius + innerRadius) / 2}
                  fill="none"
                  stroke={nonZeroSlices[0].color}
                  strokeWidth={outerRadius - innerRadius}
                />
              ) : (
                nonZeroSlices.map((slice) => {
                  const sweep = (slice.count / totalOrders) * 360;
                  const start = runningAngle;
                  const end = runningAngle + sweep;
                  runningAngle = end;

                  return (
                    <path
                      key={slice.status}
                      d={describeDonutSlice(
                        center,
                        center,
                        outerRadius,
                        innerRadius,
                        start,
                        end
                      )}
                      fill={slice.color}
                      stroke="#FFFFFF"
                      strokeWidth={2.2}
                    />
                  );
                })
              )}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-[22px] font-extrabold text-[#111827] leading-tight">
                {formatIndianNumber(totalOrders)}
              </span>
              <span className="text-[13.5px] font-medium text-[#374151] mt-0.5">
                Orders
              </span>
            </div>
          </div>

          {/* 4-Status Breakdown Legend */}
          <div className="w-full flex-1 space-y-3.5">
            {slices.map((slice) => (
              <div
                key={slice.status}
                className="flex items-center justify-between gap-3 text-[13.5px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="font-medium text-[#1F2937] truncate">
                    {slice.label}
                  </span>
                </div>

                <div className="shrink-0 whitespace-nowrap">
                  <span className="font-bold text-[#111827]">
                    {slice.percentage}%
                  </span>{' '}
                  <span className="text-[#6B7280] font-normal">
                    ({formatIndianNumber(slice.count)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
