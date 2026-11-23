import React, { useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useFinancialAnalyticsData } from '@/hooks/useFinancialAnalytics';
import { recordVendorPayoutInFirestore } from '@/services/adminFirestore';
import type { PayoutPaymentMethod } from '@/types/admin';
import {
  type FinancialDatePreset,
  type FinancialStatusFilter,
  type VendorEarningsRow,
  type VendorPayoutStatusLabel,
  buildFinancialReportCsv,
  computeFinancialAnalytics,
} from '@/utils/financials';
import {
  formatDisplayDate,
  formatINR,
  formatIndianNumber,
  toLocalDateKey,
} from '@/utils/formatters';

const DATE_PRESETS: { key: FinancialDatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

const PAYMENT_METHODS: PayoutPaymentMethod[] = [
  'Bank Transfer (NEFT/IMPS)',
  'UPI',
  'RTGS',
  'Cheque',
];

function getPayoutStatusBadgeStyle(status: VendorPayoutStatusLabel): string {
  switch (status) {
    case 'Settled':
      return 'bg-[#DCFCE7] text-[#15803D]';
    case 'Partially Paid':
      return 'bg-[#DBEAFE] text-[#1D4ED8]';
    case 'Unpaid':
      return 'bg-[#FEF3C7] text-[#D97706]';
    case 'Awaiting Delivery':
      return 'bg-[#F3F4F6] text-[#4B5563]';
    case 'No Orders':
    default:
      return 'bg-[#F9FAFB] text-[#9CA3AF]';
  }
}

interface SummaryCardItem {
  label: string;
  value: string;
  sublabel?: string;
  accentClass?: string;
}

export const FinancialAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    orders,
    vendors,
    payouts,
    commissions,
    settings,
    loading,
    error,
  } = useFinancialAnalyticsData();

  const [datePreset, setDatePreset] = useState<FinancialDatePreset>('all');
  const [vendorIdFilter, setVendorIdFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] =
    useState<FinancialStatusFilter>('all');

  // Record Payout Modal State
  const [payoutModalVendorId, setPayoutModalVendorId] = useState<string | null>(
    null
  );
  const [payoutAmountInput, setPayoutAmountInput] = useState('');
  const [payoutDateInput, setPayoutDateInput] = useState(() =>
    toLocalDateKey(new Date())
  );
  const [payoutMethodInput, setPayoutMethodInput] =
    useState<PayoutPaymentMethod>('Bank Transfer (NEFT/IMPS)');
  const [payoutReferenceInput, setPayoutReferenceInput] = useState('');
  const [payoutNotesInput, setPayoutNotesInput] = useState('');
  const [isRecordingPayout, setIsRecordingPayout] = useState(false);
  const [payoutFormError, setPayoutFormError] = useState<string | null>(null);
  const [bannerFeedback, setBannerFeedback] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const analytics = useMemo(
    () =>
      computeFinancialAnalytics({
        orders,
        vendors,
        payouts,
        commissions,
        defaultCommissionPercent: settings.defaultCommissionPercent,
        datePreset,
        vendorIdFilter,
        statusFilter,
      }),
    [
      commissions,
      datePreset,
      orders,
      payouts,
      settings.defaultCommissionPercent,
      statusFilter,
      vendorIdFilter,
      vendors,
    ]
  );

  const { summary, vendorRows, filteredPayouts } = analytics;

  const eligibleVendorsForPayout = useMemo(
    () => vendorRows.filter((v) => v.remainingPayout > 0),
    [vendorRows]
  );

  const selectedVendorForModal: VendorEarningsRow | null = useMemo(() => {
    if (!payoutModalVendorId) return null;
    return (
      vendorRows.find((r) => r.vendorId === payoutModalVendorId) ??
      vendorRows[0] ??
      null
    );
  }, [payoutModalVendorId, vendorRows]);

  const handleOpenPayoutModal = (row?: VendorEarningsRow) => {
    setPayoutFormError(null);
    const targetRow = row ?? eligibleVendorsForPayout[0] ?? vendorRows[0];
    if (!targetRow) {
      setBannerFeedback({
        text: 'No vendors found to record a payout.',
        isError: true,
      });
      return;
    }
    setPayoutModalVendorId(targetRow.vendorId);
    setPayoutAmountInput(
      targetRow.remainingPayout > 0
        ? String(Math.floor(targetRow.remainingPayout * 100) / 100)
        : ''
    );
    setPayoutDateInput(toLocalDateKey(new Date()));
    setPayoutMethodInput('Bank Transfer (NEFT/IMPS)');
    setPayoutReferenceInput('');
    setPayoutNotesInput('');
  };

  const handleSwitchModalVendor = (nextVendorId: string) => {
    setPayoutModalVendorId(nextVendorId);
    setPayoutFormError(null);
    const matched = vendorRows.find((r) => r.vendorId === nextVendorId);
    setPayoutAmountInput(
      matched && matched.remainingPayout > 0
        ? String(Math.floor(matched.remainingPayout * 100) / 100)
        : ''
    );
  };

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecordingPayout || !selectedVendorForModal) return;

    setPayoutFormError(null);
    const numericAmount = Number(payoutAmountInput);
    const cleanRef = payoutReferenceInput.trim();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setPayoutFormError('Enter a valid payout amount greater than ₹0.');
      return;
    }

    if (selectedVendorForModal.remainingPayout <= 0) {
      setPayoutFormError(
        `${selectedVendorForModal.vendorName} has ₹0 remaining eligible payout balance (orders must be Delivered before payout).`
      );
      return;
    }

    if (numericAmount > selectedVendorForModal.remainingPayout + 0.01) {
      setPayoutFormError(
        `Amount cannot exceed remaining eligible payout balance (${formatINR(selectedVendorForModal.remainingPayout)}).`
      );
      return;
    }

    if (cleanRef.length < 3) {
      setPayoutFormError(
        'Enter a valid unique Transaction Reference / UTR ID.'
      );
      return;
    }

    const duplicateLocal = payouts.some(
      (p) =>
        p.referenceId &&
        p.referenceId.trim().toLowerCase() === cleanRef.toLowerCase()
    );
    if (duplicateLocal) {
      setPayoutFormError(
        `Duplicate entry prevented: Transaction reference "${cleanRef}" has already been recorded.`
      );
      return;
    }

    setIsRecordingPayout(true);
    try {
      await recordVendorPayoutInFirestore({
        vendorId: selectedVendorForModal.vendorId,
        vendorName: selectedVendorForModal.vendorName,
        amount: numericAmount,
        grossDeliveredSales: selectedVendorForModal.allTimeDeliveredProductSales,
        commissionAmount: selectedVendorForModal.allTimeDeliveredCommission,
        commissionRate: selectedVendorForModal.commissionRate,
        eligibleNetEarnings: selectedVendorForModal.allTimeEligibleNetEarnings,
        alreadyPaidAmount: selectedVendorForModal.allTimeAmountPaid,
        payoutDate: payoutDateInput,
        paymentMethod: payoutMethodInput,
        referenceId: cleanRef,
        notes: payoutNotesInput,
        adminUid: user?.uid ?? null,
      });

      setBannerFeedback({
        text: `Payout of ${formatINR(numericAmount)} to ${selectedVendorForModal.vendorName} (Ref: ${cleanRef}) recorded atomically.`,
        isError: false,
      });
      setPayoutModalVendorId(null);
    } catch (err) {
      setPayoutFormError(
        err instanceof Error
          ? err.message
          : 'Unable to record payout in Firestore.'
      );
    } finally {
      setIsRecordingPayout(false);
    }
  };

  const handleExportCsv = () => {
    const selectedVendorLabel =
      vendorIdFilter === 'all'
        ? 'All Vendors'
        : vendors.find((v) => v.id === vendorIdFilter)?.storeName ??
          vendorIdFilter;

    const csvContent = buildFinancialReportCsv({
      analytics,
      datePreset,
      vendorNameLabel: selectedVendorLabel,
      statusFilter,
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zemigo-financial-report-${datePreset}-${toLocalDateKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setBannerFeedback({
      text: 'Financial report exported to CSV successfully.',
      isError: false,
    });
  };

  const summaryCards: SummaryCardItem[] = [
    {
      label: 'Total Orders',
      value: formatIndianNumber(summary.totalOrders),
      sublabel: `${summary.deliveredOrdersCount} delivered • ${summary.pendingOrdersCount} in progress`,
    },
    {
      label: 'Total Sales',
      value: formatINR(summary.totalSales),
      sublabel: `Product base: ${formatINR(summary.totalProductSales)} (excl. ${formatINR(summary.totalDeliveryCharges)} delivery)`,
    },
    {
      label: 'Delivered Sales',
      value: formatINR(summary.deliveredSales),
      sublabel: `${summary.deliveredOrdersCount} completed orders eligible for payout`,
      accentClass: 'text-[#15803D]',
    },
    {
      label: 'Pending / In-Progress Order Value',
      value: formatINR(summary.pendingOrderValue),
      sublabel: `${summary.pendingOrdersCount} active orders awaiting delivery`,
      accentClass: 'text-[#D97706]',
    },
    {
      label: 'Cancelled Orders',
      value: formatIndianNumber(summary.cancelledOrders),
      sublabel: `Excluded value: ${formatINR(summary.cancelledOrderValue)}`,
      accentClass: 'text-[#DC2626]',
    },
    {
      label: 'ZemiGo Total Commission',
      value: formatINR(summary.zemigoTotalCommission),
      sublabel: `Earned on delivered • Est. ${formatINR(summary.pendingEstimatedCommission)} pending`,
      accentClass: 'text-[#16A34A]',
    },
    {
      label: 'Total Vendor Earnings',
      value: formatINR(summary.totalVendorEarnings),
      sublabel: `Net eligible • Est. ${formatINR(summary.pendingEstimatedVendorEarnings)} in progress`,
      accentClass: 'text-[#111827]',
    },
    {
      label: 'Total Vendor Payouts Paid',
      value: formatINR(summary.totalVendorPayoutsPaid),
      sublabel: `${filteredPayouts.filter((p) => p.status === 'paid').length} settled payout transaction(s)`,
      accentClass: 'text-[#15803D]',
    },
    {
      label: 'Pending Vendor Payouts',
      value: formatINR(summary.pendingVendorPayouts),
      sublabel: `${eligibleVendorsForPayout.length} vendor(s) with payable balance`,
      accentClass:
        summary.pendingVendorPayouts > 0 ? 'text-[#D97706]' : 'text-[#111827]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Export / Payout Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#111827] tracking-tight">
            Financial Analytics &amp; Vendor Earnings
          </h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Live ZemiGo platform GMV, commission deductions, seller earnings, and
            payout settlements (`zemigo-2dfa5`).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading}
            className="rounded-xl border border-[#16A34A] bg-white hover:bg-[#EAF7EF] text-[#15803D] font-bold text-[13.5px] px-4 py-2.5 transition-colors disabled:opacity-50"
          >
            Export CSV Report
          </button>

          <button
            type="button"
            onClick={() => handleOpenPayoutModal()}
            disabled={loading || vendorRows.length === 0}
            className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13.5px] px-5 py-2.5 shadow-sm transition-colors disabled:opacity-50"
          >
            + Record Payout
          </button>
        </div>
      </div>

      {/* Commission Rule Policy Banner */}
      <div className="rounded-2xl border border-[#DCFCE7] bg-[#F6FEF9] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[12.5px] text-[#166534]">
        <div>
          <span className="font-bold">Active Commission Rule:</span> Default
          platform rate is{' '}
          <span className="font-extrabold">
            {settings.defaultCommissionPercent}%
          </span>{' '}
          (overridden per vendor in Firestore). Calculated strictly on product
          selling subtotals excluding delivery charges.
        </div>
        <span className="text-[11.5px] font-semibold text-[#15803D] shrink-0">
          Cancelled excluded • Delivered eligible
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13.5px] text-[#B91C1C]">
          Firestore Error: {error}
        </div>
      ) : null}

      {bannerFeedback ? (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-[13.5px] font-medium flex items-center justify-between gap-3',
            bannerFeedback.isError
              ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
              : 'border-[#BBF7D0] bg-[#EAF7EF] text-[#15803D]',
          ].join(' ')}
        >
          <span>{bannerFeedback.text}</span>
          <button
            type="button"
            onClick={() => setBannerFeedback(null)}
            className="text-[12px] font-bold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Filter Bar: Date Presets + Vendor Filter + Status Filter */}
      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#4B5563] mr-1">
            Period:
          </span>
          {DATE_PRESETS.map((preset) => {
            const active = datePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => setDatePreset(preset.key)}
                className={[
                  'px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-colors',
                  active
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6]',
                ].join(' ')}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Vendor & Order Status Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="financial-vendor-filter"
              className="text-[12.5px] font-bold text-[#4B5563]"
            >
              Vendor:
            </label>
            <select
              id="financial-vendor-filter"
              value={vendorIdFilter}
              onChange={(e) => setVendorIdFilter(e.target.value)}
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#111827] focus:border-[#16A34A] focus:outline-none"
            >
              <option value="all">All Vendors ({vendors.length})</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.storeName} ({v.commissionRate ?? settings.defaultCommissionPercent}%)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="financial-status-filter"
              className="text-[12.5px] font-bold text-[#4B5563]"
            >
              Order Status:
            </label>
            <select
              id="financial-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as FinancialStatusFilter)
              }
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#111827] focus:border-[#16A34A] focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="placed">Placed</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* 1. OVERALL BUSINESS SUMMARY (9 Cards) */}
      <section aria-label="Overall Business Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5"
            >
              <p className="text-[13px] font-semibold text-[#6B7280]">
                {card.label}
              </p>
              {loading ? (
                <div className="mt-2 h-8 w-32 animate-pulse rounded-lg bg-[#F1F5F9]" />
              ) : (
                <p
                  className={[
                    'text-[26px] font-extrabold tracking-tight mt-1',
                    card.accentClass ?? 'text-[#111827]',
                  ].join(' ')}
                >
                  {card.value}
                </p>
              )}
              {card.sublabel ? (
                <p className="text-[12px] text-[#6B7280] mt-1.5">
                  {card.sublabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* 2. VENDOR-WISE EARNINGS TABLE */}
      <section className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[18px] font-extrabold text-[#111827]">
              Vendor-Wise Earnings &amp; Commission Breakdown
            </h2>
            <p className="text-[13px] text-[#6B7280]">
              Delivered orders determine payable net earnings; in-progress
              orders are shown separately and cancelled orders are excluded.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] border-collapse">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12px]">
                <th className="py-2.5 px-3 text-left rounded-l-lg font-semibold">
                  Vendor Name
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Total Orders
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Delivered Orders
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Total Product Sales
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Commission Rate
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  ZemiGo Commission
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Vendor Net Earnings
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Amount Already Paid
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Remaining Payout
                </th>
                <th className="py-2.5 px-3 text-center font-semibold">
                  Payout Status
                </th>
                <th className="py-2.5 px-3 text-right rounded-r-lg font-semibold">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6] text-[13.5px]">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={11} className="py-4 px-3">
                      <div className="h-5 w-full animate-pulse rounded bg-[#F1F5F9]" />
                    </td>
                  </tr>
                ))
              ) : vendorRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-10 text-center text-[13.5px] text-[#6B7280]"
                  >
                    No vendor earnings found for the selected filters.
                  </td>
                </tr>
              ) : (
                vendorRows.map((row) => (
                  <tr key={row.vendorId} className="hover:bg-[#FAFAFB]">
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-[#111827]">
                        {row.vendorName}
                      </div>
                      <div className="text-[11px] text-[#6B7280]">
                        {row.vendorEmail || row.city || row.vendorId}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right font-semibold text-[#111827]">
                      <div>{formatIndianNumber(row.totalOrders)}</div>
                      {row.cancelledOrders > 0 ? (
                        <div className="text-[11px] text-[#DC2626]">
                          {row.cancelledOrders} cancelled
                        </div>
                      ) : null}
                    </td>

                    <td className="py-3.5 px-3 text-right font-semibold text-[#15803D]">
                      {formatIndianNumber(row.deliveredOrders)}
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <div className="font-bold text-[#111827]">
                        {formatINR(row.totalProductSales)}
                      </div>
                      <div className="text-[11px] text-[#6B7280]">
                        Del: {formatINR(row.deliveredProductSales)} • Pend:{' '}
                        {formatINR(row.pendingProductSales)}
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-right font-bold text-[#374151]">
                      {row.commissionRate}%
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <div className="font-bold text-[#16A34A]">
                        {formatINR(row.zemigoCommission)}
                      </div>
                      {row.pendingEstimatedCommission > 0 ? (
                        <div className="text-[11px] text-[#D97706]">
                          Est. {formatINR(row.pendingEstimatedCommission)} pend
                        </div>
                      ) : null}
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <div className="font-bold text-[#111827]">
                        {formatINR(row.vendorNetEarnings)}
                      </div>
                      {row.pendingEstimatedVendorEarnings > 0 ? (
                        <div className="text-[11px] text-[#6B7280]">
                          Est. {formatINR(row.pendingEstimatedVendorEarnings)} pend
                        </div>
                      ) : null}
                    </td>

                    <td className="py-3.5 px-3 text-right font-semibold text-[#15803D]">
                      {formatINR(row.amountAlreadyPaid)}
                    </td>

                    <td className="py-3.5 px-3 text-right font-extrabold text-[#111827]">
                      {formatINR(row.remainingPayout)}
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={[
                          'inline-flex px-2.5 py-1 rounded-full text-[11.5px] font-bold whitespace-nowrap',
                          getPayoutStatusBadgeStyle(row.payoutStatus),
                        ].join(' ')}
                      >
                        {row.payoutStatus}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenPayoutModal(row)}
                        disabled={row.remainingPayout <= 0}
                        className={[
                          'px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors whitespace-nowrap',
                          row.remainingPayout > 0
                            ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                            : 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed',
                        ].join(' ')}
                      >
                        {row.remainingPayout > 0
                          ? 'Record Payout'
                          : row.payoutStatus === 'Settled'
                            ? 'Settled'
                            : 'Not Eligible'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. COMPLETE PAYOUT HISTORY TABLE */}
      <section className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[18px] font-extrabold text-[#111827]">
              Vendor Payout History (`payouts` collection)
            </h2>
            <p className="text-[13px] text-[#6B7280]">
              Audit trail of all recorded bank/UPI vendor settlements.
            </p>
          </div>
          <span className="text-[12.5px] font-bold text-[#15803D] bg-[#EAF7EF] px-3 py-1 rounded-full">
            {filteredPayouts.length} Record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12px]">
                <th className="py-2.5 px-3 text-left rounded-l-lg font-semibold">
                  Reference ID
                </th>
                <th className="py-2.5 px-3 text-left font-semibold">Vendor</th>
                <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                <th className="py-2.5 px-3 text-left font-semibold">
                  Payment Method
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Gross Sales
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Commission
                </th>
                <th className="py-2.5 px-3 text-right font-semibold">
                  Net Paid
                </th>
                <th className="py-2.5 px-3 text-right rounded-r-lg font-semibold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6] text-[13.5px]">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={8} className="py-4 px-3">
                      <div className="h-5 w-full animate-pulse rounded bg-[#F1F5F9]" />
                    </td>
                  </tr>
                ))
              ) : filteredPayouts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-[13.5px] text-[#6B7280]"
                  >
                    No vendor payouts recorded in Firestore (`payouts`
                    collection) for the selected filter yet.
                  </td>
                </tr>
              ) : (
                filteredPayouts.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAFAFB]">
                    <td className="py-3 px-3 font-mono font-bold text-[#111827] text-[12.5px]">
                      {p.referenceId || p.id}
                    </td>
                    <td className="py-3 px-3 font-bold text-[#111827]">
                      {p.vendorName}
                    </td>
                    <td className="py-3 px-3 text-[#4B5563]">
                      {p.payoutDate ||
                        (p.createdAt.getTime() > 0
                          ? formatDisplayDate(p.createdAt)
                          : '—')}
                    </td>
                    <td className="py-3 px-3 text-[#374151]">
                      {p.paymentMethod || 'Bank Transfer'}
                    </td>
                    <td className="py-3 px-3 text-right text-[#4B5563]">
                      {formatINR(p.grossAmount)}
                    </td>
                    <td className="py-3 px-3 text-right text-[#6B7280]">
                      {formatINR(p.commissionAmount)}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-[#15803D]">
                      {formatINR(p.netPayout)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={[
                          'px-2.5 py-0.5 rounded-full text-[11.5px] font-bold capitalize',
                          p.status === 'paid'
                            ? 'bg-[#DCFCE7] text-[#15803D]'
                            : 'bg-[#FEF3C7] text-[#D97706]',
                        ].join(' ')}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. RECORD PAYOUT MODAL */}
      {selectedVendorForModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !isRecordingPayout && setPayoutModalVendorId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#ECEEF2]">
              <h3 className="text-[18px] font-extrabold text-[#111827]">
                Record Vendor Payout
              </h3>
              <button
                type="button"
                disabled={isRecordingPayout}
                onClick={() => setPayoutModalVendorId(null)}
                className="text-[13px] font-semibold text-[#6B7280] hover:text-[#111827]"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmitPayout} className="mt-4 space-y-4">
              <div>
                <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                  Vendor
                </label>
                <select
                  value={selectedVendorForModal.vendorId}
                  onChange={(e) => handleSwitchModalVendor(e.target.value)}
                  disabled={isRecordingPayout}
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] font-semibold bg-white"
                >
                  {vendorRows.map((r) => (
                    <option key={r.vendorId} value={r.vendorId}>
                      {r.vendorName} (Remaining: {formatINR(r.remainingPayout)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Balance Summary */}
              <div className="rounded-xl bg-[#F9FAFB] border border-[#ECEEF2] p-3.5 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[11px] font-semibold text-[#6B7280]">
                    Eligible Net Earnings
                  </div>
                  <div className="text-[14px] font-extrabold text-[#111827] mt-0.5">
                    {formatINR(
                      selectedVendorForModal.allTimeEligibleNetEarnings
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#6B7280]">
                    Already Paid
                  </div>
                  <div className="text-[14px] font-extrabold text-[#15803D] mt-0.5">
                    {formatINR(selectedVendorForModal.allTimeAmountPaid)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#6B7280]">
                    Remaining Payable
                  </div>
                  <div className="text-[14px] font-extrabold text-[#D97706] mt-0.5">
                    {formatINR(selectedVendorForModal.remainingPayout)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                    Payout Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    disabled={isRecordingPayout}
                    value={payoutAmountInput}
                    onChange={(e) => setPayoutAmountInput(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                    Payout Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isRecordingPayout}
                    value={payoutDateInput}
                    onChange={(e) => setPayoutDateInput(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={payoutMethodInput}
                    disabled={isRecordingPayout}
                    onChange={(e) =>
                      setPayoutMethodInput(
                        e.target.value as PayoutPaymentMethod
                      )
                    }
                    className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] bg-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                    Transaction Reference / UTR *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isRecordingPayout}
                    value={payoutReferenceInput}
                    onChange={(e) => setPayoutReferenceInput(e.target.value)}
                    placeholder="e.g. UTR902184712"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-[#374151] mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  disabled={isRecordingPayout}
                  value={payoutNotesInput}
                  onChange={(e) => setPayoutNotesInput(e.target.value)}
                  placeholder="Weekly settlement note"
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
                />
              </div>

              {payoutFormError ? (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#B91C1C]">
                  {payoutFormError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isRecordingPayout}
                  onClick={() => setPayoutModalVendorId(null)}
                  className="rounded-xl border border-[#E5E7EB] px-4 py-2 text-[13.5px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isRecordingPayout ||
                    selectedVendorForModal.remainingPayout <= 0
                  }
                  className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-[13.5px] px-5 py-2.5 disabled:opacity-50"
                >
                  {isRecordingPayout ? 'Recording Payout...' : 'Confirm & Record Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
