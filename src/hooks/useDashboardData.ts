import { useEffect, useMemo, useState } from 'react';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  subscribeCustomers,
  subscribeOrders,
  subscribeVendors,
} from '@/services/adminFirestore';
import type {
  AdminCustomerRecord,
  AdminOrderSummary,
  AdminVendorRecord,
  DashboardMetrics,
  OrderStatusSlice,
  SalesOverviewPoint,
  SalesRangeKey,
} from '@/types/admin';
import { formatShortAxisDate, toLocalDateKey } from '@/utils/formatters';

function computePercentageDelta(
  current: number,
  previous: number
): number | null {
  if (previous <= 0) {
    return current > 0 ? 100 : null;
  }
  return ((current - previous) / previous) * 100;
}

export interface UseDashboardDataResult {
  metrics: DashboardMetrics;
  orders: AdminOrderSummary[];
  vendors: AdminVendorRecord[];
  customers: AdminCustomerRecord[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes to live Firebase Firestore collections (`orders`, `vendors`, `users`)
 * and dynamically computes all Dashboard KPIs, Sales Overview points, Order Status
 * breakdown, Recent Orders, and Top Vendors — with zero permanent fake data.
 */
export function useDashboardData(
  selectedDate: Date,
  salesRange: SalesRangeKey
): UseDashboardDataResult {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [vendors, setVendors] = useState<AdminVendorRecord[]>([]);
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>([]);

  const [ordersLoaded, setOrdersLoaded] = useState(!isFirebaseConfigured);
  const [vendorsLoaded, setVendorsLoaded] = useState(!isFirebaseConfigured);
  const [customersLoaded, setCustomersLoaded] = useState(!isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    const unsubOrders = subscribeOrders(
      (data) => {
        setOrders(data);
        setOrdersLoaded(true);
      },
      (err) => {
        setError(err.message);
        setOrdersLoaded(true);
      }
    );

    const unsubVendors = subscribeVendors(
      (data) => {
        setVendors(data);
        setVendorsLoaded(true);
      },
      (err) => {
        setError(err.message);
        setVendorsLoaded(true);
      }
    );

    const unsubCustomers = subscribeCustomers(
      (data) => {
        setCustomers(data);
        setCustomersLoaded(true);
      },
      (err) => {
        setError(err.message);
        setCustomersLoaded(true);
      }
    );

    return () => {
      unsubOrders();
      unsubVendors();
      unsubCustomers();
    };
  }, []);

  const metrics = useMemo<DashboardMetrics>(() => {
    const endOfSelectedDay = new Date(selectedDate);
    endOfSelectedDay.setHours(23, 59, 59, 999);

    const filteredOrders = orders.filter(
      (o) =>
        o.createdAt.getTime() === 0 ||
        o.createdAt.getTime() <= endOfSelectedDay.getTime()
    );

    const totalOrders = filteredOrders.length;
    const validSalesOrders = filteredOrders.filter(
      (o) => o.status !== 'cancelled'
    );
    const totalSales = validSalesOrders.reduce((sum, o) => sum + o.amount, 0);

    // Day-over-day comparison for Orders & Sales relative to selectedDate
    const selectedDayKey = toLocalDateKey(selectedDate);
    const yesterdayDate = new Date(selectedDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = toLocalDateKey(yesterdayDate);

    let todayOrderCount = 0;
    let yesterdayOrderCount = 0;
    let todaySalesSum = 0;
    let yesterdaySalesSum = 0;

    const salesByDay = new Map<string, { sales: number; orders: number }>();

    for (const order of filteredOrders) {
      if (order.createdAt.getTime() <= 0) continue;
      const dayKey = toLocalDateKey(order.createdAt);

      const bucket = salesByDay.get(dayKey) ?? { sales: 0, orders: 0 };
      bucket.orders += 1;
      if (order.status !== 'cancelled') {
        bucket.sales += order.amount;
      }
      salesByDay.set(dayKey, bucket);

      if (dayKey === selectedDayKey) {
        todayOrderCount += 1;
        if (order.status !== 'cancelled') todaySalesSum += order.amount;
      } else if (dayKey === yesterdayKey) {
        yesterdayOrderCount += 1;
        if (order.status !== 'cancelled') yesterdaySalesSum += order.amount;
      }
    }

    const ordersDeltaPercent = computePercentageDelta(
      todayOrderCount,
      yesterdayOrderCount
    );
    const salesDeltaPercent = computePercentageDelta(
      todaySalesSum,
      yesterdaySalesSum
    );

    // Active Vendors & weekly delta
    const activeVendorList = vendors.filter((v) => v.active);
    const activeVendors = activeVendorList.length;

    const sevenDaysAgo = new Date(endOfSelectedDay);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(endOfSelectedDay);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const newVendorsThisWeek = activeVendorList.filter(
      (v) => v.createdAt.getTime() >= sevenDaysAgo.getTime()
    ).length;
    const newVendorsPrevWeek = activeVendorList.filter(
      (v) =>
        v.createdAt.getTime() >= fourteenDaysAgo.getTime() &&
        v.createdAt.getTime() < sevenDaysAgo.getTime()
    ).length;
    const vendorsDeltaPercent = computePercentageDelta(
      newVendorsThisWeek,
      newVendorsPrevWeek
    );

    // Total Customers (real `users` docs, or distinct customers from orders if `users` collection hasn't synced yet)
    const distinctOrderCustomerCount = new Set(
      filteredOrders.map(
        (o) => o.customerEmail?.toLowerCase() || o.customerName.toLowerCase()
      )
    ).size;
    const totalCustomers = Math.max(
      customers.length,
      distinctOrderCustomerCount
    );

    const newCustomersThisWeek = customers.filter(
      (c) => c.createdAt.getTime() >= sevenDaysAgo.getTime()
    ).length;
    const newCustomersPrevWeek = customers.filter(
      (c) =>
        c.createdAt.getTime() >= fourteenDaysAgo.getTime() &&
        c.createdAt.getTime() < sevenDaysAgo.getTime()
    ).length;
    const customersDeltaPercent = computePercentageDelta(
      newCustomersThisWeek,
      newCustomersPrevWeek
    );

    // Sales Overview daily series (7 / 14 / 30 days ending on selectedDate)
    const rangeDays =
      salesRange === '30d' ? 30 : salesRange === '14d' ? 14 : 7;
    const salesSeries: SalesOverviewPoint[] = [];

    for (let offset = rangeDays - 1; offset >= 0; offset--) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - offset);
      const key = toLocalDateKey(d);
      const bucket = salesByDay.get(key);
      salesSeries.push({
        dateKey: key,
        label: formatShortAxisDate(d),
        sales: bucket?.sales ?? 0,
        orders: bucket?.orders ?? 0,
      });
    }

    // Order Status Doughnut Breakdown
    let deliveredCount = 0;
    let processingCount = 0;
    let shippedCount = 0;
    let cancelledCount = 0;

    for (const order of filteredOrders) {
      if (order.status === 'delivered') deliveredCount++;
      else if (order.status === 'shipped' || order.status === 'out_for_delivery')
        shippedCount++;
      else if (order.status === 'cancelled') cancelledCount++;
      else processingCount++;
    }

    const pct = (count: number) =>
      totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;

    const orderStatusSlices: OrderStatusSlice[] = [
      {
        status: 'delivered',
        label: 'Delivered',
        count: deliveredCount,
        percentage: pct(deliveredCount),
        color: '#16A34A',
      },
      {
        status: 'processing',
        label: 'Processing',
        count: processingCount,
        percentage: pct(processingCount),
        color: '#F59E0B',
      },
      {
        status: 'shipped',
        label: 'Shipped',
        count: shippedCount,
        percentage: pct(shippedCount),
        color: '#2563EB',
      },
      {
        status: 'cancelled',
        label: 'Cancelled',
        count: cancelledCount,
        percentage: pct(cancelledCount),
        color: '#EF4444',
      },
    ];

    // Top Vendors aggregated dynamically from live `orders` without double-counting static totals
    const vendorStatsMap = new Map<string, AdminVendorRecord>();
    for (const v of vendors) {
      vendorStatsMap.set(v.id, { ...v, totalOrders: 0, totalSales: 0 });
    }

    for (const order of validSalesOrders) {
      if (order.suborders.length > 0) {
        for (const sub of order.suborders) {
          if (sub.status === 'cancelled') continue;
          const vId = sub.vendorId || 'unknown';
          const subSales =
            sub.sellingSubtotal > 0
              ? sub.sellingSubtotal
              : sub.items.reduce((s, it) => s + it.lineTotal, 0);
          const existing = vendorStatsMap.get(vId);
          if (existing) {
            existing.totalOrders += 1;
            existing.totalSales += subSales;
          } else {
            vendorStatsMap.set(vId, {
              id: vId,
              storeName: sub.vendorName || 'ZemiGo Seller',
              categoryLabel: 'Marketplace Seller',
              city: 'India',
              rating: 4.6,
              verified: true,
              active: true,
              approvalStatus: 'approved',
              totalOrders: 1,
              totalSales: subSales,
              createdAt: order.createdAt,
            });
          }
        }
        continue;
      }

      const shareCount = Math.max(
        1,
        order.vendorIds.length || order.vendorNames.length
      );
      const shareAmount = order.amount / shareCount;

      if (order.vendorIds.length > 0) {
        order.vendorIds.forEach((vId, idx) => {
          const existing = vendorStatsMap.get(vId);
          if (existing) {
            existing.totalOrders += 1;
            existing.totalSales += shareAmount;
          } else {
            vendorStatsMap.set(vId, {
              id: vId,
              storeName: order.vendorNames[idx] || 'ZemiGo Seller',
              categoryLabel: 'Marketplace Seller',
              city: 'India',
              rating: 4.6,
              verified: true,
              active: true,
              approvalStatus: 'approved',
              totalOrders: 1,
              totalSales: shareAmount,
              createdAt: order.createdAt,
            });
          }
        });
      } else if (order.vendorNames.length > 0) {
        for (const name of order.vendorNames) {
          const matched = Array.from(vendorStatsMap.values()).find(
            (v) => v.storeName.toLowerCase() === name.toLowerCase()
          );
          if (matched) {
            matched.totalOrders += 1;
            matched.totalSales += shareAmount;
          } else {
            vendorStatsMap.set(`name:${name}`, {
              id: `name:${name}`,
              storeName: name,
              categoryLabel: 'Marketplace Seller',
              city: 'India',
              rating: 4.6,
              verified: true,
              active: true,
              approvalStatus: 'approved',
              totalOrders: 1,
              totalSales: shareAmount,
              createdAt: order.createdAt,
            });
          }
        }
      }
    }

    const topVendors = Array.from(vendorStatsMap.values()).sort(
      (a, b) => b.totalSales - a.totalSales || b.totalOrders - a.totalOrders
    );

    return {
      totalOrders,
      ordersDeltaPercent,
      totalSales,
      salesDeltaPercent,
      activeVendors,
      vendorsDeltaPercent,
      totalCustomers,
      customersDeltaPercent,
      salesSeries,
      orderStatusSlices,
      recentOrders: filteredOrders.slice(0, 6),
      topVendors,
    };
  }, [orders, vendors, customers, selectedDate, salesRange]);

  return {
    metrics,
    orders,
    vendors,
    customers,
    loading: !(ordersLoaded && vendorsLoaded && customersLoaded),
    error,
  };
}
