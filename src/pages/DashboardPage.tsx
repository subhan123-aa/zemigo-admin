import React, { useRef, useState } from 'react';

import { KpiStatCard } from '@/components/dashboard/KpiStatCard';
import { OrderStatusChart } from '@/components/dashboard/OrderStatusChart';
import { RecentOrdersTable } from '@/components/dashboard/RecentOrdersTable';
import { SalesOverviewChart } from '@/components/dashboard/SalesOverviewChart';
import { TopVendorsTable } from '@/components/dashboard/TopVendorsTable';
import {
  CalendarOutlineIcon,
  ChevronDownSmallIcon,
  CustomersGroupIcon,
  OrdersCartIcon,
  VendorsStoreIcon,
} from '@/components/icons/AdminIcons';
import { useAuth } from '@/context/AuthContext';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { SalesRangeKey } from '@/types/admin';
import {
  formatDisplayDate,
  formatINR,
  formatIndianNumber,
  toLocalDateKey,
} from '@/utils/formatters';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [salesRange, setSalesRange] = useState<SalesRangeKey>('7d');
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { metrics, loading } = useDashboardData(selectedDate, salesRange);

  const adminFirstName =
    user?.displayName?.trim().split(' ')[0] || 'Admin';

  const handleOpenDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if ('showPicker' in HTMLInputElement.prototype) {
      try {
        input.showPicker();
        return;
      } catch {
        // Fallback to focus
      }
    }
    input.focus();
  };

  return (
    <div className="space-y-6">
      {/* Welcome Heading & Right-Aligned Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-extrabold text-[#111827] tracking-tight leading-tight">
            Welcome back, {adminFirstName}
          </h1>
          <p className="text-[14.5px] text-[#4B5563] mt-1">
            Here&apos;s what&apos;s happening on ZemiGo today.
          </p>
        </div>

        {/* Date Selector Pill (Below Header on the Right) */}
        <div className="relative self-start sm:self-auto">
          <button
            type="button"
            onClick={handleOpenDatePicker}
            className="inline-flex items-center gap-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors"
          >
            <CalendarOutlineIcon className="w-4 h-4 text-[#4B5563] shrink-0" />
            <span>{formatDisplayDate(selectedDate)}</span>
            <ChevronDownSmallIcon className="w-4 h-4 text-[#4B5563] ml-0.5 shrink-0" />
          </button>

          <input
            ref={dateInputRef}
            type="date"
            aria-label="Select dashboard date"
            value={toLocalDateKey(selectedDate)}
            max={toLocalDateKey(new Date())}
            onChange={(e) => {
              if (!e.target.value) return;
              const [y, m, d] = e.target.value.split('-').map(Number);
              if (y && m && d) {
                setSelectedDate(new Date(y, m - 1, d));
              }
            }}
            className="sr-only"
          />
        </div>
      </div>

      {/* 4 KPI Cards */}
      <section
        aria-label="Key Performance Indicators"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
      >
        <KpiStatCard
          title="Total Orders"
          value={formatIndianNumber(metrics.totalOrders)}
          deltaPercent={metrics.ordersDeltaPercent}
          comparisonLabel="vs yesterday"
          loading={loading}
          icon={<OrdersCartIcon className="w-6 h-6" />}
        />

        <KpiStatCard
          title="Total Sales"
          value={formatINR(metrics.totalSales)}
          deltaPercent={metrics.salesDeltaPercent}
          comparisonLabel="vs yesterday"
          loading={loading}
          icon={
            <span className="text-[22px] font-bold leading-none select-none">
              ₹
            </span>
          }
        />

        <KpiStatCard
          title="Active Vendors"
          value={formatIndianNumber(metrics.activeVendors)}
          deltaPercent={metrics.vendorsDeltaPercent}
          comparisonLabel="this week"
          loading={loading}
          icon={<VendorsStoreIcon className="w-6 h-6" />}
        />

        <KpiStatCard
          title="Total Customers"
          value={formatIndianNumber(metrics.totalCustomers)}
          deltaPercent={metrics.customersDeltaPercent}
          comparisonLabel="this week"
          loading={loading}
          icon={<CustomersGroupIcon className="w-6 h-6" />}
        />
      </section>

      {/* Sales Overview Line Chart + Order Status Doughnut Chart */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7">
          <SalesOverviewChart
            points={metrics.salesSeries}
            range={salesRange}
            onChangeRange={setSalesRange}
            loading={loading}
          />
        </div>

        <div className="xl:col-span-5">
          <OrderStatusChart
            slices={metrics.orderStatusSlices}
            totalOrders={metrics.totalOrders}
            loading={loading}
          />
        </div>
      </section>

      {/* Recent Orders Table + Top Vendors Table */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7">
          <RecentOrdersTable
            orders={metrics.recentOrders}
            loading={loading}
          />
        </div>

        <div className="xl:col-span-5">
          <TopVendorsTable
            vendors={metrics.topVendors}
            loading={loading}
          />
        </div>
      </section>
    </div>
  );
};
