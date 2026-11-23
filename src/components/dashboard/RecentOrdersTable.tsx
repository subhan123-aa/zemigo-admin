import React from 'react';
import { Link } from 'react-router-dom';

import {
  ArrowRightSmallIcon,
  CustomersUserIcon,
} from '@/components/icons/AdminIcons';
import type { AdminOrderSummary } from '@/types/admin';
import {
  formatINR,
  formatOrderIdLabel,
  getOrderStatusBadge,
} from '@/utils/formatters';

export interface RecentOrdersTableProps {
  orders: AdminOrderSummary[];
  loading?: boolean;
}

export const RecentOrdersTable: React.FC<RecentOrdersTableProps> = ({
  orders,
  loading = false,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[18px] font-bold text-[#111827] tracking-tight">
          Recent Orders
        </h2>

        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#16A34A] hover:text-[#15803D] transition-colors"
        >
          <span>View All</span>
          <ArrowRightSmallIcon className="w-4 h-4" />
        </Link>
      </div>

      <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
        <table className="w-full min-w-[440px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px] font-medium">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Order ID
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Customer</th>
              <th className="py-2.5 px-3 text-right font-medium">Amount</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {loading ? (
              [0, 1, 2, 3].map((row) => (
                <tr key={row}>
                  <td colSpan={4} className="py-3.5 px-3">
                    <div className="h-5 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No recent orders recorded in Firestore yet.
                </td>
              </tr>
            ) : (
              orders.slice(0, 5).map((order) => {
                const badge = getOrderStatusBadge(order.status);
                return (
                  <tr
                    key={order.id}
                    className="hover:bg-[#FAFAFB] transition-colors"
                  >
                    <td className="py-3.5 px-3 font-bold text-[#111827] whitespace-nowrap">
                      {formatOrderIdLabel(order.orderNumber)}
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2 text-[#1F2937] font-medium">
                        <CustomersUserIcon className="w-4 h-4 text-[#6B7280] shrink-0" />
                        <span className="truncate max-w-[165px]">
                          {order.customerName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right font-bold text-[#111827] whitespace-nowrap">
                      {formatINR(order.amount)}
                    </td>

                    <td className="py-3.5 px-3 text-right whitespace-nowrap">
                      <span
                        className={[
                          'inline-flex items-center justify-center px-3 py-1 rounded-full text-[12px] font-semibold',
                          badge.className,
                        ].join(' ')}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
