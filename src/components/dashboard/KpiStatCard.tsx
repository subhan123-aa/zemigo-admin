import React from 'react';

import { TrendUpRightIcon } from '@/components/icons/AdminIcons';

export interface KpiStatCardProps {
  title: string;
  value: string;
  deltaPercent: number | null;
  comparisonLabel: string;
  icon: React.ReactNode;
  loading?: boolean;
}

export const KpiStatCard: React.FC<KpiStatCardProps> = ({
  title,
  value,
  deltaPercent,
  comparisonLabel,
  icon,
  loading = false,
}) => {
  const formattedDelta =
    deltaPercent === null
      ? '0.0%'
      : `${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`;

  const isNegative = deltaPercent !== null && deltaPercent < 0;

  return (
    <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card px-5 py-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-[#E8F8EE] text-[#16A34A] flex items-center justify-center shrink-0">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[#1F2937] truncate">
          {title}
        </p>

        {loading ? (
          <div className="h-8 w-28 bg-gray-100 rounded-lg animate-pulse mt-1" />
        ) : (
          <p className="text-[26px] font-extrabold text-[#111827] tracking-tight leading-tight mt-0.5 truncate">
            {value}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-1 text-[12.5px] leading-none">
          <TrendUpRightIcon
            className={[
              'w-3.5 h-3.5 shrink-0',
              isNegative ? 'text-[#DC2626] rotate-90' : 'text-[#16A34A]',
            ].join(' ')}
          />
          <span
            className={[
              'font-semibold',
              isNegative ? 'text-[#DC2626]' : 'text-[#16A34A]',
            ].join(' ')}
          >
            {formattedDelta}
          </span>
          <span className="text-[#4B5563] truncate">{comparisonLabel}</span>
        </div>
      </div>
    </div>
  );
};
