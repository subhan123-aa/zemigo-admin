import React from 'react';
import { Link } from 'react-router-dom';

import {
  ArrowRightSmallIcon,
  DashboardHomeIcon,
  ProductsCubeIcon,
  VendorsStoreIcon,
} from '@/components/icons/AdminIcons';
import type { AdminVendorRecord } from '@/types/admin';
import { formatINR, formatIndianNumber } from '@/utils/formatters';

export interface TopVendorsTableProps {
  vendors: AdminVendorRecord[];
  loading?: boolean;
}

function renderVendorCategoryIcon(categoryLabel: string): React.ReactNode {
  const lower = categoryLabel.toLowerCase();
  if (lower.includes('home') || lower.includes('living')) {
    return <DashboardHomeIcon className="w-5 h-5 text-white" />;
  }
  if (lower.includes('electron') || lower.includes('gadget')) {
    return <ProductsCubeIcon className="w-5 h-5 text-white" />;
  }
  return <VendorsStoreIcon className="w-5 h-5 text-white" />;
}

export const TopVendorsTable: React.FC<TopVendorsTableProps> = ({
  vendors,
  loading = false,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[18px] font-bold text-[#111827] tracking-tight">
          Top Vendors
        </h2>

        <Link
          to="/vendors"
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#16A34A] hover:text-[#15803D] transition-colors"
        >
          <span>View All</span>
          <ArrowRightSmallIcon className="w-4 h-4" />
        </Link>
      </div>

      <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
        <table className="w-full min-w-[360px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px] font-medium">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Vendor
              </th>
              <th className="py-2.5 px-3 text-center font-medium">Orders</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Sales
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {loading ? (
              [0, 1, 2].map((row) => (
                <tr key={row}>
                  <td colSpan={3} className="py-3.5 px-3">
                    <div className="h-9 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : vendors.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No vendor sales recorded in Firestore yet.
                </td>
              </tr>
            ) : (
              vendors.slice(0, 4).map((vendor) => (
                <tr
                  key={vendor.id}
                  className="hover:bg-[#FAFAFB] transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {vendor.logoUrl ? (
                        <img
                          src={vendor.logoUrl}
                          alt={vendor.storeName}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#E5E7EB]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
                          {renderVendorCategoryIcon(vendor.categoryLabel)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="font-bold text-[#111827] text-[14px] leading-tight truncate">
                          {vendor.storeName}
                        </p>
                        <p className="text-[12px] text-[#6B7280] leading-tight mt-0.5 truncate">
                          {vendor.categoryLabel}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-center font-medium text-[#1F2937] whitespace-nowrap">
                    {formatIndianNumber(vendor.totalOrders)}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-[#111827] whitespace-nowrap">
                    {formatINR(vendor.totalSales)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
