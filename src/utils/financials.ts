import type {
  AdminCommissionRecord,
  AdminOrderSummary,
  AdminPayoutRecord,
  AdminVendorRecord,
  OrderOverallStatus,
} from '@/types/admin';
import { formatOrderIdLabel, toLocalDateKey } from '@/utils/formatters';

export type FinancialDatePreset = 'today' | '7d' | 'month' | 'all';

export type FinancialStatusFilter = 'all' | OrderOverallStatus;

export type VendorPayoutStatusLabel =
  | 'Settled'
  | 'Partially Paid'
  | 'Unpaid'
  | 'Awaiting Delivery'
  | 'No Orders';

export interface OverallFinancialSummary {
  totalOrders: number;
  totalSales: number;
  deliveredSales: number;
  pendingOrderValue: number;
  cancelledOrders: number;
  cancelledOrderValue: number;
  zemigoTotalCommission: number;
  pendingEstimatedCommission: number;
  totalVendorEarnings: number;
  pendingEstimatedVendorEarnings: number;
  totalVendorPayoutsPaid: number;
  pendingVendorPayouts: number;
  deliveredOrdersCount: number;
  pendingOrdersCount: number;
  totalProductSales: number;
  totalDeliveryCharges: number;
}

export interface VendorEarningsRow {
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  city?: string;
  upiId?: string;
  bankAccountLast4?: string;
  totalOrders: number;
  deliveredOrders: number;
  inProgressOrders: number;
  cancelledOrders: number;
  totalProductSales: number;
  deliveredProductSales: number;
  pendingProductSales: number;
  commissionRate: number;
  zemigoCommission: number;
  pendingEstimatedCommission: number;
  vendorNetEarnings: number;
  pendingEstimatedVendorEarnings: number;
  amountAlreadyPaid: number;
  remainingPayout: number;
  allTimeDeliveredProductSales: number;
  allTimeDeliveredCommission: number;
  allTimeEligibleNetEarnings: number;
  allTimeAmountPaid: number;
  payoutStatus: VendorPayoutStatusLabel;
}

export interface FinancialAnalyticsResult {
  summary: OverallFinancialSummary;
  vendorRows: VendorEarningsRow[];
  filteredOrders: AdminOrderSummary[];
  filteredPayouts: AdminPayoutRecord[];
}

export interface VendorSlice {
  vendorId: string;
  vendorName: string;
  productSales: number;
  status: OrderOverallStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function matchesDatePreset(
  date: Date,
  preset: FinancialDatePreset,
  now = new Date()
): boolean {
  if (preset === 'all') return true;
  if (!date || date.getTime() <= 0) return false;

  if (preset === 'today') {
    return toLocalDateKey(date) === toLocalDateKey(now);
  }

  if (preset === 'month') {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }

  if (preset === '7d') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setTime(start.getTime() - 6 * DAY_MS);
    return date.getTime() >= start.getTime() && date.getTime() <= now.getTime() + DAY_MS;
  }

  return true;
}

/**
 * Extracts vendor-level product selling subtotals from an order.
 * Reuses the exact ZemiGo commission base: `sellingSubtotal` after product discounts,
 * strictly excluding delivery charges so delivery fees are never commissioned.
 */
export function extractOrderVendorSlices(
  order: AdminOrderSummary
): VendorSlice[] {
  if (order.suborders.length > 0) {
    return order.suborders.map((sub) => {
      const itemsFallback = sub.items.reduce((s, it) => s + it.lineTotal, 0);
      const baseSales =
        sub.sellingSubtotal > 0 ? sub.sellingSubtotal : itemsFallback;
      return {
        vendorId: sub.vendorId || 'unknown',
        vendorName: sub.vendorName || 'Verified Store',
        productSales: Math.max(0, baseSales),
        status: sub.status,
      };
    });
  }

  if (order.items.length > 0) {
    const grouped = new Map<
      string,
      { vendorName: string; productSales: number }
    >();
    for (const item of order.items) {
      const vId = item.vendorId || order.vendorIds[0] || 'unknown';
      const vName =
        item.vendorName || order.vendorNames[0] || 'Verified Store';
      const cur = grouped.get(vId) ?? { vendorName: vName, productSales: 0 };
      cur.productSales += Math.max(0, item.lineTotal);
      grouped.set(vId, cur);
    }
    return Array.from(grouped.entries()).map(([vendorId, val]) => ({
      vendorId,
      vendorName: val.vendorName,
      productSales: val.productSales,
      status: order.status,
    }));
  }

  const productBase = Math.max(
    0,
    order.sellingSubtotal > 0
      ? order.sellingSubtotal
      : order.amount - (order.deliveryCharges || 0)
  );
  const vIds =
    order.vendorIds.length > 0 ? order.vendorIds : ['unknown'];
  const share = productBase / vIds.length;
  return vIds.map((vendorId, idx) => ({
    vendorId,
    vendorName: order.vendorNames[idx] || 'Verified Store',
    productSales: share,
    status: order.status,
  }));
}

export function resolveVendorCommissionRate(
  vendor: Pick<AdminVendorRecord, 'commissionRate'> | undefined,
  defaultCommissionPercent: number
): number {
  const raw = vendor?.commissionRate;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return Number.isFinite(defaultCommissionPercent) && defaultCommissionPercent >= 0
    ? defaultCommissionPercent
    : 10;
}

export function computeFinancialAnalytics(params: {
  orders: AdminOrderSummary[];
  vendors: AdminVendorRecord[];
  payouts: AdminPayoutRecord[];
  commissions: AdminCommissionRecord[];
  defaultCommissionPercent: number;
  datePreset: FinancialDatePreset;
  vendorIdFilter: string;
  statusFilter: FinancialStatusFilter;
  now?: Date;
}): FinancialAnalyticsResult {
  const {
    orders,
    vendors,
    payouts,
    commissions,
    defaultCommissionPercent,
    datePreset,
    vendorIdFilter,
    statusFilter,
    now = new Date(),
  } = params;

  const vendorMap = new Map<string, AdminVendorRecord>();
  for (const v of vendors) {
    vendorMap.set(v.id, v);
  }

  // Index any explicit Firestore `commissions` documents by `${orderId}::${vendorId}`
  const explicitCommissionMap = new Map<string, AdminCommissionRecord>();
  for (const c of commissions) {
    if (c.orderId && c.vendorId) {
      explicitCommissionMap.set(`${c.orderId}::${c.vendorId}`, c);
    }
  }

  // Track ALL-TIME delivered earnings & paid payouts per vendor so Remaining Payout is always accurate
  const allTimeVendorAcc = new Map<
    string,
    {
      vendorName: string;
      deliveredProductSales: number;
      deliveredCommission: number;
      eligibleNetEarnings: number;
      paidAmount: number;
    }
  >();

  const ensureAllTimeAcc = (vendorId: string, vendorName: string) => {
    const existing = allTimeVendorAcc.get(vendorId);
    if (existing) return existing;
    const created = {
      vendorName,
      deliveredProductSales: 0,
      deliveredCommission: 0,
      eligibleNetEarnings: 0,
      paidAmount: 0,
    };
    allTimeVendorAcc.set(vendorId, created);
    return created;
  };

  for (const v of vendors) {
    ensureAllTimeAcc(v.id, v.storeName);
  }

  for (const order of orders) {
    const slices = extractOrderVendorSlices(order);
    for (const slice of slices) {
      if (slice.status !== 'delivered') continue;
      const vendorRec = vendorMap.get(slice.vendorId);
      const rate = resolveVendorCommissionRate(
        vendorRec,
        defaultCommissionPercent
      );
      const explicitRec = explicitCommissionMap.get(
        `${order.id}::${slice.vendorId}`
      );
      const commissionAmt = explicitRec
        ? explicitRec.commissionAmount
        : Math.round((slice.productSales * rate) / 100);
      const netAmt = Math.max(0, slice.productSales - commissionAmt);

      const acc = ensureAllTimeAcc(
        slice.vendorId,
        vendorRec?.storeName || slice.vendorName
      );
      acc.deliveredProductSales += slice.productSales;
      acc.deliveredCommission += commissionAmt;
      acc.eligibleNetEarnings += netAmt;
    }
  }

  for (const payout of payouts) {
    if (payout.status !== 'paid' || !payout.vendorId) continue;
    const vendorRec = vendorMap.get(payout.vendorId);
    const acc = ensureAllTimeAcc(
      payout.vendorId,
      vendorRec?.storeName || payout.vendorName
    );
    acc.paidAmount += payout.netPayout;
  }

  // Apply active UI filters (Date, Vendor, Order Status)
  const filteredOrders = orders.filter((order) => {
    if (!matchesDatePreset(order.createdAt, datePreset, now)) return false;
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (vendorIdFilter !== 'all') {
      const slices = extractOrderVendorSlices(order);
      if (!slices.some((s) => s.vendorId === vendorIdFilter)) return false;
    }
    return true;
  });

  const filteredPayouts = payouts.filter((payout) => {
    const payoutDate = payout.paidAt ?? payout.createdAt;
    if (!matchesDatePreset(payoutDate, datePreset, now)) return false;
    if (vendorIdFilter !== 'all' && payout.vendorId !== vendorIdFilter) {
      return false;
    }
    return true;
  });

  // Aggregate Vendor-Wise Earnings over filtered orders + filtered payouts (paired with all-time balances)
  const vendorAccMap = new Map<string, VendorEarningsRow>();
  const ensureVendorRow = (vendorId: string, fallbackName: string) => {
    const existing = vendorAccMap.get(vendorId);
    if (existing) return existing;
    const vendorRec = vendorMap.get(vendorId);
    const rate = resolveVendorCommissionRate(
      vendorRec,
      defaultCommissionPercent
    );
    const allTime = allTimeVendorAcc.get(vendorId);
    const allTimeNet = allTime?.eligibleNetEarnings ?? 0;
    const allTimePaid = allTime?.paidAmount ?? 0;
    const remaining = Math.max(0, allTimeNet - allTimePaid);

    const row: VendorEarningsRow = {
      vendorId,
      vendorName: vendorRec?.storeName || fallbackName,
      vendorEmail: vendorRec?.email,
      city: vendorRec?.city,
      upiId: (vendorRec as unknown as { upiId?: string })?.upiId,
      bankAccountLast4: (vendorRec as unknown as { bankAccountLast4?: string })
        ?.bankAccountLast4,
      totalOrders: 0,
      deliveredOrders: 0,
      inProgressOrders: 0,
      cancelledOrders: 0,
      totalProductSales: 0,
      deliveredProductSales: 0,
      pendingProductSales: 0,
      commissionRate: rate,
      zemigoCommission: 0,
      pendingEstimatedCommission: 0,
      vendorNetEarnings: 0,
      pendingEstimatedVendorEarnings: 0,
      amountAlreadyPaid: 0,
      remainingPayout: remaining,
      allTimeDeliveredProductSales: allTime?.deliveredProductSales ?? 0,
      allTimeDeliveredCommission: allTime?.deliveredCommission ?? 0,
      allTimeEligibleNetEarnings: allTimeNet,
      allTimeAmountPaid: allTimePaid,
      payoutStatus: 'No Orders',
    };
    vendorAccMap.set(vendorId, row);
    return row;
  };

  if (vendorIdFilter === 'all') {
    for (const v of vendors) {
      ensureVendorRow(v.id, v.storeName);
    }
  } else {
    const selectedVendor = vendorMap.get(vendorIdFilter);
    if (selectedVendor) {
      ensureVendorRow(selectedVendor.id, selectedVendor.storeName);
    }
  }

  let totalSales = 0;
  let deliveredSales = 0;
  let pendingOrderValue = 0;
  let cancelledOrders = 0;
  let cancelledOrderValue = 0;
  let deliveredOrdersCount = 0;
  let pendingOrdersCount = 0;
  let totalProductSales = 0;
  let totalDeliveryCharges = 0;
  let zemigoTotalCommission = 0;
  let pendingEstimatedCommission = 0;
  let totalVendorEarnings = 0;
  let pendingEstimatedVendorEarnings = 0;

  for (const order of filteredOrders) {
    const slices = extractOrderVendorSlices(order).filter(
      (s) => vendorIdFilter === 'all' || s.vendorId === vendorIdFilter
    );
    if (slices.length === 0) continue;

    // Order-level summary metrics (exclude cancelled suborder slices cleanly)
    const cancelledSlicesTotal = slices
      .filter((s) => s.status === 'cancelled')
      .reduce((sum, s) => sum + s.productSales, 0);
    const nonCancelledProductSum = slices
      .filter((s) => s.status !== 'cancelled')
      .reduce((sum, s) => sum + s.productSales, 0);
    const orderDisplayAmount =
      vendorIdFilter === 'all'
        ? Math.max(0, order.amount - cancelledSlicesTotal)
        : nonCancelledProductSum;

    if (order.status === 'cancelled') {
      cancelledOrders += 1;
      cancelledOrderValue += orderDisplayAmount;
    } else if (order.status === 'delivered') {
      totalSales += orderDisplayAmount;
      deliveredSales += orderDisplayAmount;
      deliveredOrdersCount += 1;
      if (vendorIdFilter === 'all') {
        totalDeliveryCharges += order.deliveryCharges || 0;
      }
    } else {
      totalSales += orderDisplayAmount;
      pendingOrderValue += orderDisplayAmount;
      pendingOrdersCount += 1;
      if (vendorIdFilter === 'all') {
        totalDeliveryCharges += order.deliveryCharges || 0;
      }
    }

    for (const slice of slices) {
      const row = ensureVendorRow(slice.vendorId, slice.vendorName);
      row.totalOrders += 1;

      if (slice.status === 'cancelled') {
        row.cancelledOrders += 1;
        continue;
      }

      const explicitRec = explicitCommissionMap.get(
        `${order.id}::${slice.vendorId}`
      );
      const effectiveRate = explicitRec
        ? explicitRec.commissionRate
        : row.commissionRate;
      const commissionAmt = explicitRec
        ? explicitRec.commissionAmount
        : Math.round((slice.productSales * effectiveRate) / 100);
      const netAmt = Math.max(0, slice.productSales - commissionAmt);

      row.totalProductSales += slice.productSales;
      totalProductSales += slice.productSales;

      if (slice.status === 'delivered') {
        row.deliveredOrders += 1;
        row.deliveredProductSales += slice.productSales;
        row.zemigoCommission += commissionAmt;
        row.vendorNetEarnings += netAmt;

        zemigoTotalCommission += commissionAmt;
        totalVendorEarnings += netAmt;
      } else {
        row.inProgressOrders += 1;
        row.pendingProductSales += slice.productSales;
        row.pendingEstimatedCommission += commissionAmt;
        row.pendingEstimatedVendorEarnings += netAmt;

        pendingEstimatedCommission += commissionAmt;
        pendingEstimatedVendorEarnings += netAmt;
      }
    }
  }

  let totalVendorPayoutsPaid = 0;
  for (const payout of filteredPayouts) {
    if (payout.status !== 'paid' || !payout.vendorId) continue;
    totalVendorPayoutsPaid += payout.netPayout;
    const row = ensureVendorRow(payout.vendorId, payout.vendorName);
    row.amountAlreadyPaid += payout.netPayout;
  }

  // Finalize vendor payout statuses & sum remaining vendor payouts
  let pendingVendorPayouts = 0;
  const vendorRows = Array.from(vendorAccMap.values()).map((row) => {
    const remaining = row.remainingPayout;
    pendingVendorPayouts += remaining;

    let payoutStatus: VendorPayoutStatusLabel = 'No Orders';
    if (row.allTimeEligibleNetEarnings > 0) {
      if (remaining <= 0) {
        payoutStatus = 'Settled';
      } else if (row.allTimeAmountPaid > 0) {
        payoutStatus = 'Partially Paid';
      } else {
        payoutStatus = 'Unpaid';
      }
    } else if (row.totalOrders > 0 && row.cancelledOrders < row.totalOrders) {
      payoutStatus = 'Awaiting Delivery';
    } else if (row.totalOrders > 0) {
      payoutStatus = 'No Orders';
    }

    return {
      ...row,
      payoutStatus,
    };
  });

  vendorRows.sort(
    (a, b) =>
      b.remainingPayout - a.remainingPayout ||
      b.totalProductSales - a.totalProductSales ||
      a.vendorName.localeCompare(b.vendorName)
  );

  return {
    summary: {
      totalOrders: filteredOrders.length,
      totalSales,
      deliveredSales,
      pendingOrderValue,
      cancelledOrders,
      cancelledOrderValue,
      zemigoTotalCommission,
      pendingEstimatedCommission,
      totalVendorEarnings,
      pendingEstimatedVendorEarnings,
      totalVendorPayoutsPaid,
      pendingVendorPayouts,
      deliveredOrdersCount,
      pendingOrdersCount,
      totalProductSales,
      totalDeliveryCharges,
    },
    vendorRows,
    filteredOrders,
    filteredPayouts,
  };
}

function escapeCsvCell(val: string | number | undefined | null): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildFinancialReportCsv(params: {
  analytics: FinancialAnalyticsResult;
  datePreset: FinancialDatePreset;
  vendorNameLabel: string;
  statusFilter: FinancialStatusFilter;
}): string {
  const { analytics, datePreset, vendorNameLabel, statusFilter } = params;
  const { summary, vendorRows, filteredOrders, filteredPayouts } = analytics;

  const lines: string[] = [];
  lines.push('ZemiGo Admin Financial Analytics Report');
  lines.push(
    [
      `Generated At: ${new Date().toISOString()}`,
      `Date Filter: ${datePreset}`,
      `Vendor Filter: ${vendorNameLabel}`,
      `Status Filter: ${statusFilter}`,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  lines.push('');

  lines.push('OVERALL BUSINESS SUMMARY');
  lines.push('Metric,Amount / Count');
  const summaryPairs: [string, string | number][] = [
    ['Total Orders', summary.totalOrders],
    ['Total Sales (INR)', summary.totalSales],
    ['Delivered Sales (INR)', summary.deliveredSales],
    ['Pending / In-Progress Order Value (INR)', summary.pendingOrderValue],
    ['Cancelled Orders', summary.cancelledOrders],
    ['Cancelled Order Value (INR)', summary.cancelledOrderValue],
    ['ZemiGo Total Commission Earned (INR)', summary.zemigoTotalCommission],
    [
      'Pending / Projected Commission (INR)',
      summary.pendingEstimatedCommission,
    ],
    ['Total Vendor Earnings Eligible (INR)', summary.totalVendorEarnings],
    [
      'Pending / Projected Vendor Earnings (INR)',
      summary.pendingEstimatedVendorEarnings,
    ],
    ['Total Vendor Payouts Paid (INR)', summary.totalVendorPayoutsPaid],
    ['Pending Vendor Payouts (INR)', summary.pendingVendorPayouts],
  ];
  for (const [k, v] of summaryPairs) {
    lines.push([escapeCsvCell(k), escapeCsvCell(v)].join(','));
  }
  lines.push('');

  lines.push('VENDOR-WISE EARNINGS');
  lines.push(
    [
      'Vendor Name',
      'Vendor ID',
      'Total Orders',
      'Delivered Orders',
      'Total Product Sales (INR)',
      'Delivered Product Sales (INR)',
      'In-Progress Product Sales (INR)',
      'Commission Rate (%)',
      'ZemiGo Commission Earned (INR)',
      'Vendor Net Earnings Eligible (INR)',
      'Amount Already Paid (INR)',
      'Remaining Payout (INR)',
      'Payout Status',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  for (const row of vendorRows) {
    lines.push(
      [
        row.vendorName,
        row.vendorId,
        row.totalOrders,
        row.deliveredOrders,
        row.totalProductSales,
        row.deliveredProductSales,
        row.pendingProductSales,
        row.commissionRate,
        row.zemigoCommission,
        row.vendorNetEarnings,
        row.amountAlreadyPaid,
        row.remainingPayout,
        row.payoutStatus,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  lines.push('');

  lines.push('ORDER FINANCIAL LEDGER');
  lines.push(
    [
      'Order Number',
      'Order ID',
      'Date',
      'Customer',
      'Vendors',
      'Status',
      'Product Subtotal (INR)',
      'Delivery Charges (INR)',
      'Order Total (INR)',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  for (const ord of filteredOrders) {
    lines.push(
      [
        formatOrderIdLabel(ord.orderNumber),
        ord.id,
        ord.createdAt.getTime() > 0 ? ord.createdAt.toISOString() : '',
        ord.customerName,
        ord.vendorNames.join(' | '),
        ord.status,
        ord.sellingSubtotal,
        ord.deliveryCharges,
        ord.amount,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  lines.push('');

  lines.push('PAYOUT TRANSACTIONS HISTORY');
  lines.push(
    [
      'Payout ID',
      'Reference ID',
      'Vendor Name',
      'Vendor ID',
      'Payout Date',
      'Payment Method',
      'Net Paid (INR)',
      'Status',
      'Notes',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  for (const p of filteredPayouts) {
    lines.push(
      [
        p.id,
        p.referenceId ?? '',
        p.vendorName,
        p.vendorId,
        p.payoutDate ?? (p.createdAt.getTime() > 0 ? p.createdAt.toISOString() : ''),
        p.paymentMethod ?? '',
        p.netPayout,
        p.status,
        p.notes ?? '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  return lines.join('\r\n');
}
