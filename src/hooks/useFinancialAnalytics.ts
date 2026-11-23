import { useEffect, useState } from 'react';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  subscribeCommissions,
  subscribeMarketplaceSettings,
  subscribeOrders,
  subscribePayouts,
  subscribeVendors,
} from '@/services/adminFirestore';
import type {
  AdminCommissionRecord,
  AdminOrderSummary,
  AdminPayoutRecord,
  AdminVendorRecord,
  MarketplaceSettings,
} from '@/types/admin';

export interface UseFinancialAnalyticsDataResult {
  orders: AdminOrderSummary[];
  vendors: AdminVendorRecord[];
  payouts: AdminPayoutRecord[];
  commissions: AdminCommissionRecord[];
  settings: MarketplaceSettings;
  loading: boolean;
  error: string | null;
}

export function useFinancialAnalyticsData(): UseFinancialAnalyticsDataResult {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [vendors, setVendors] = useState<AdminVendorRecord[]>([]);
  const [payouts, setPayouts] = useState<AdminPayoutRecord[]>([]);
  const [commissions, setCommissions] = useState<AdminCommissionRecord[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings>({
    defaultCommissionPercent: 10,
    freeDeliveryThreshold: 499,
    supportEmail: 'support@zemigo.in',
  });

  const [ordersReady, setOrdersReady] = useState(!isFirebaseConfigured);
  const [vendorsReady, setVendorsReady] = useState(!isFirebaseConfigured);
  const [payoutsReady, setPayoutsReady] = useState(!isFirebaseConfigured);
  const [settingsReady, setSettingsReady] = useState(!isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const handleError = (err: Error) => {
      setError(err.message || 'Unable to load financial data from Firestore.');
    };

    const unsubOrders = subscribeOrders(
      (data) => {
        setOrders(data);
        setOrdersReady(true);
      },
      (err) => {
        handleError(err);
        setOrdersReady(true);
      }
    );

    const unsubVendors = subscribeVendors(
      (data) => {
        setVendors(data);
        setVendorsReady(true);
      },
      (err) => {
        handleError(err);
        setVendorsReady(true);
      }
    );

    const unsubPayouts = subscribePayouts(
      (data) => {
        setPayouts(data);
        setPayoutsReady(true);
      },
      (err) => {
        handleError(err);
        setPayoutsReady(true);
      }
    );

    const unsubCommissions = subscribeCommissions((data) => {
      setCommissions(data);
    });

    const unsubSettings = subscribeMarketplaceSettings(
      (next) => {
        setSettings(next);
        setSettingsReady(true);
      },
      (err) => {
        handleError(err);
        setSettingsReady(true);
      }
    );

    return () => {
      unsubOrders();
      unsubVendors();
      unsubPayouts();
      unsubCommissions();
      unsubSettings();
    };
  }, []);

  return {
    orders,
    vendors,
    payouts,
    commissions,
    settings,
    loading: !(ordersReady && vendorsReady && payoutsReady && settingsReady),
    error,
  };
}
