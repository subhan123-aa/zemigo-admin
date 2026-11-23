import type { OrderOverallStatus } from '@/types/admin';

/**
 * Formats numbers using Indian numbering system (`en-IN`, e.g., `12,540`, `4,86,320`).
 */
export function formatIndianNumber(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

/**
 * Formats INR currency using Indian locale (`₹4,86,320`).
 */
export function formatINR(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/**
 * Formats a Date as `07 Nov 2026` matching the header date selector.
 */
export function formatDisplayDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats a Date as `01 Nov` for the Sales Overview X-axis.
 */
export function formatShortAxisDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month}`;
}

/**
 * Formats an YYYY-MM-DD local date key for `<input type="date">` and daily bucketing.
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes order numbers to `#ZM...` display format matching the ZemiGo customer app.
 */
export function formatOrderIdLabel(rawId: string): string {
  const clean = rawId.trim();
  if (!clean) return '#ZM00000';
  if (clean.startsWith('#')) return clean;
  if (clean.toUpperCase().startsWith('ZM')) return `#${clean.toUpperCase()}`;
  return `#ZM${clean.slice(0, 6).toUpperCase()}`;
}

export interface StatusBadgeStyle {
  label: string;
  className: string;
}

/**
 * Status badge styles matching the ZemiGo Admin Dashboard & Customer App:
 * - Placed: Soft amber
 * - Confirmed: Soft sky blue
 * - Processing: Warm orange
 * - Shipped: Soft blue
 * - Out for Delivery: Soft indigo
 * - Delivered: Soft green
 * - Cancelled: Soft red
 */
export function getOrderStatusBadge(status: OrderOverallStatus): StatusBadgeStyle {
  switch (status) {
    case 'placed':
      return {
        label: 'Placed',
        className: 'bg-[#FFFBEB] text-[#D97706]',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        className: 'bg-[#F0F9FF] text-[#0284C7]',
      };
    case 'processing':
      return {
        label: 'Processing',
        className: 'bg-[#FEF3C7] text-[#EA580C]',
      };
    case 'shipped':
      return {
        label: 'Shipped',
        className: 'bg-[#DBEAFE] text-[#1D4ED8]',
      };
    case 'out_for_delivery':
      return {
        label: 'Out for Delivery',
        className: 'bg-[#EEF2FF] text-[#4F46E5]',
      };
    case 'delivered':
      return {
        label: 'Delivered',
        className: 'bg-[#DCFCE7] text-[#15803D]',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-[#FEE2E2] text-[#DC2626]',
      };
  }
}
