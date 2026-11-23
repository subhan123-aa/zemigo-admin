import React, { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { BannersPage as BannersManagementPage } from '@/pages/BannersPage';
import { CategoriesPage as CategoriesManagementPage } from '@/pages/CategoriesPage';
import { FinancialAnalyticsPage } from '@/pages/FinancialAnalyticsPage';
import {
  approveProductInFirestore,
  approveVendorInFirestore,
  createCouponInFirestore,
  createProductInFirestore,
  createVendorInFirestore,
  deleteCouponInFirestore,
  rejectProductInFirestore,
  rejectVendorInFirestore,
  saveMarketplaceSettingsInFirestore,
  subscribeCommissions,
  subscribeCoupons,
  subscribeCustomers,
  subscribeMarketplaceSettings,
  subscribeOrders,
  subscribeProducts,
  subscribeVendors,
  toggleCouponActiveInFirestore,
  toggleVendorActiveInFirestore,
  updateOrderStatusInFirestore,
  updateVendorCommissionRateInFirestore,
} from '@/services/adminFirestore';
import { uploadAdminAsset } from '@/services/adminStorage';
import type {
  AdminCommissionRecord,
  AdminCouponRecord,
  AdminCustomerRecord,
  AdminOrderSummary,
  AdminProductRecord,
  AdminVendorRecord,
  MarketplaceSettings,
  OrderOverallStatus,
} from '@/types/admin';
import {
  formatDisplayDate,
  formatINR,
  formatOrderIdLabel,
  getOrderStatusBadge,
} from '@/utils/formatters';

const PageHeader: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <div className="mb-6">
    <h1 className="text-[24px] sm:text-[26px] font-extrabold text-[#111827] tracking-tight">
      {title}
    </h1>
    <p className="text-[14px] text-[#6B7280] mt-1">{subtitle}</p>
  </div>
);

export const VendorsPage: React.FC = () => {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<AdminVendorRecord[]>([]);
  const [storeName, setStoreName] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('Fashion & Clothing');
  const [city, setCity] = useState('');
  const [commissionRate, setCommissionRate] = useState('10');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeVendors(setVendors, (err) => {
        setMsg(`Firestore error reading vendors: ${err.message}`);
      }),
    [user?.uid]
  );

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        logoUrl = await uploadAdminAsset('vendors', logoFile);
      }
      const parsedRate =
        commissionRate.trim() === ''
          ? 10
          : Math.max(0, Math.min(50, Number(commissionRate)));
      await createVendorInFirestore({
        storeName,
        categoryLabel,
        city: city || 'India',
        commissionRate: Number.isFinite(parsedRate) ? parsedRate : 10,
        logoUrl,
      });
      setStoreName('');
      setCity('');
      setLogoFile(null);
      setMsg('Vendor saved to Firestore.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unable to save vendor.');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveVendor = async (vendorId: string) => {
    setMsg(null);
    try {
      await approveVendorInFirestore(vendorId, user?.uid);
      setMsg('Vendor approved and activated.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to approve vendor.');
    }
  };

  const handleRejectVendor = async (vendorId: string) => {
    setMsg(null);
    try {
      await rejectVendorInFirestore(
        vendorId,
        'Rejected by Admin review',
        user?.uid
      );
      setMsg('Vendor rejected.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to reject vendor.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Manage multi-vendor seller stores synced with ZemiGo Firestore."
      />

      <form
        onSubmit={handleAddVendor}
        className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
      >
        <div>
          <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
            Store Name
          </label>
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. StyleHub"
            required
            className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
            Category
          </label>
          <input
            value={categoryLabel}
            onChange={(e) => setCategoryLabel(e.target.value)}
            placeholder="Fashion & Clothing"
            className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
            City
          </label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mumbai"
            className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
            Commission (%)
          </label>
          <input
            type="number"
            min={0}
            max={50}
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
            className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
            Store Logo (Storage)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="w-full text-[12px] text-[#6B7280]"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-60 text-white font-semibold text-[13.5px] py-2.5 px-4"
        >
          {saving ? 'Saving...' : 'Add Vendor'}
        </button>
        {msg ? (
          <p className="sm:col-span-2 lg:col-span-6 text-[12.5px] text-[#15803D] font-medium">
            {msg}
          </p>
        ) : null}
      </form>

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px]">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Vendor
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Category</th>
              <th className="py-2.5 px-3 text-left font-medium">City</th>
              <th className="py-2.5 px-3 text-right font-medium">
                Commission
              </th>
              <th className="py-2.5 px-3 text-center font-medium">Approval</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Status / Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {vendors.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No vendors found in Firestore (`vendors` collection).
                </td>
              </tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id}>
                  <td className="py-3 px-3">
                    <div className="font-bold text-[#111827]">{v.storeName}</div>
                    {v.email ? (
                      <div className="text-[12px] text-[#6B7280]">{v.email}</div>
                    ) : null}
                  </td>
                  <td className="py-3 px-3 text-[#4B5563]">
                    {v.categoryLabel}
                  </td>
                  <td className="py-3 px-3 text-[#4B5563]">{v.city}</td>
                  <td className="py-3 px-3 text-right font-medium">
                    {v.commissionRate ?? 10}%
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={[
                        'inline-flex px-2.5 py-1 rounded-full text-[11.5px] font-semibold capitalize',
                        v.approvalStatus === 'approved'
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : v.approvalStatus === 'rejected'
                            ? 'bg-[#FEE2E2] text-[#DC2626]'
                            : 'bg-[#FEF3C7] text-[#D97706]',
                      ].join(' ')}
                    >
                      {v.approvalStatus}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {v.approvalStatus !== 'approved' ? (
                        <button
                          type="button"
                          onClick={() => void handleApproveVendor(v.id)}
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white"
                        >
                          Approve
                        </button>
                      ) : null}
                      {v.approvalStatus !== 'rejected' ? (
                        <button
                          type="button"
                          onClick={() => void handleRejectVendor(v.id)}
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2]"
                        >
                          Reject
                        </button>
                      ) : null}
                      {v.approvalStatus === 'approved' ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleVendorActiveInFirestore(v.id, !v.active).catch(
                              () => {}
                            )
                          }
                          className={[
                            'px-3 py-1 rounded-full text-[12px] font-semibold',
                            v.active
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : 'bg-gray-100 text-[#6B7280]',
                          ].join(' ')}
                        >
                          {v.active ? 'Active' : 'Inactive'}
                        </button>
                      ) : null}
                    </div>
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

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryName, setCategoryName] = useState('Electronics');
  const [vendorName, setVendorName] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeProducts(setProducts), []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await uploadAdminAsset('products', imageFile);
      }
      await createProductInFirestore({
        name,
        brand: brand || 'ZemiGo',
        categoryName,
        vendorName: vendorName || 'ZemiGo Seller',
        price: Number(price),
        originalPrice: Number(originalPrice) || Number(price),
        imageUrl,
      });
      setName('');
      setBrand('');
      setPrice('');
      setOriginalPrice('');
      setImageFile(null);
    } catch {
      // Handled when Firebase .env is unconfigured
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Catalog items stored in the shared `products` Firestore collection."
      />

      <form
        onSubmit={handleCreate}
        className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product Name"
          required
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Brand"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          placeholder="Category"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="Vendor Name"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Selling Price (₹)"
          required
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          type="number"
          value={originalPrice}
          onChange={(e) => setOriginalPrice(e.target.value)}
          placeholder="MRP Price (₹)"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="text-[12px] text-[#6B7280]"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13.5px] py-2.5 px-4"
        >
          {saving ? 'Uploading...' : 'Add Product'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px]">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Product
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Vendor</th>
              <th className="py-2.5 px-3 text-left font-medium">Category</th>
              <th className="py-2.5 px-3 text-right font-medium">Price</th>
              <th className="py-2.5 px-3 text-center font-medium">Approval</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Stock / Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No products found in Firestore (`products` collection).
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-3 font-bold text-[#111827]">
                    {p.name}
                  </td>
                  <td className="py-3 px-3 text-[#4B5563]">{p.vendorName}</td>
                  <td className="py-3 px-3 text-[#4B5563]">
                    {p.categoryName}
                  </td>
                  <td className="py-3 px-3 text-right font-bold">
                    {formatINR(p.price)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={[
                        'inline-flex px-2.5 py-1 rounded-full text-[11.5px] font-semibold capitalize',
                        p.approvalStatus === 'approved'
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : p.approvalStatus === 'rejected'
                            ? 'bg-[#FEE2E2] text-[#DC2626]'
                            : 'bg-[#FEF3C7] text-[#D97706]',
                      ].join(' ')}
                    >
                      {p.approvalStatus}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {p.approvalStatus !== 'approved' ? (
                        <button
                          type="button"
                          onClick={() =>
                            approveProductInFirestore(p.id, user?.uid).catch(
                              () => {}
                            )
                          }
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold bg-[#16A34A] hover:bg-[#15803D] text-white"
                        >
                          Approve
                        </button>
                      ) : null}
                      {p.approvalStatus !== 'rejected' ? (
                        <button
                          type="button"
                          onClick={() =>
                            rejectProductInFirestore(
                              p.id,
                              'Rejected by Admin',
                              user?.uid
                            ).catch(() => {})
                          }
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2]"
                        >
                          Reject
                        </button>
                      ) : null}
                      <span
                        className={[
                          'px-2.5 py-1 rounded-full text-[12px] font-semibold',
                          p.inStock
                            ? 'bg-[#DCFCE7] text-[#15803D]'
                            : 'bg-[#FEE2E2] text-[#DC2626]',
                        ].join(' ')}
                      >
                        {p.inStock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>
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

export const CategoriesPage: React.FC = () => <CategoriesManagementPage />;

export const BannersPage: React.FC = () => <BannersManagementPage />;

function formatDisplayDateTime(date: Date): string {
  if (!date || date.getTime() <= 0) return '—';
  const datePart = formatDisplayDate(date);
  const timePart = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState<string | null>(
    null
  );

  useEffect(() => subscribeOrders(setOrders), []);

  const visibleOrders =
    statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  const selectedOrder =
    orders.find((o) => o.id === selectedOrderId) ?? null;

  const handleStatusChange = async (
    orderId: string,
    nextStatus: OrderOverallStatus
  ) => {
    setStatusUpdateMessage(null);
    try {
      await updateOrderStatusInFirestore(orderId, nextStatus);
      setStatusUpdateMessage(
        `Order status updated to ${nextStatus.toUpperCase()}.`
      );
    } catch (err) {
      setStatusUpdateMessage(
        err instanceof Error
          ? err.message
          : 'Unable to update order status in Firestore.'
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Real-time customer orders synced with the ZemiGo mobile app."
      />

      {statusUpdateMessage ? (
        <div className="mb-4 rounded-xl bg-[#EAF7EF] border border-[#BBF7D0] px-4 py-2.5 text-[13px] font-medium text-[#15803D] flex items-center justify-between">
          <span>{statusUpdateMessage}</span>
          <button
            type="button"
            onClick={() => setStatusUpdateMessage(null)}
            className="text-[12px] font-bold text-[#15803D] hover:underline ml-3"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-5">
        {(
          [
            { key: 'all', label: 'All Orders' },
            { key: 'placed', label: 'Placed' },
            { key: 'confirmed', label: 'Confirmed' },
            { key: 'processing', label: 'Processing' },
            { key: 'shipped', label: 'Shipped' },
            { key: 'out_for_delivery', label: 'Out for Delivery' },
            { key: 'delivered', label: 'Delivered' },
            { key: 'cancelled', label: 'Cancelled' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={[
              'px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-colors',
              statusFilter === tab.key
                ? 'bg-[#16A34A] text-white'
                : 'bg-white border border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px]">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Order ID
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Customer</th>
              <th className="py-2.5 px-3 text-left font-medium">
                Products & Stores
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Date & Time</th>
              <th className="py-2.5 px-3 text-right font-medium">Amount</th>
              <th className="py-2.5 px-3 text-right font-medium">
                Update Status
              </th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {visibleOrders.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No matching orders found in Firestore (`orders` collection).
                </td>
              </tr>
            ) : (
              visibleOrders.map((order) => {
                const badge = getOrderStatusBadge(order.status);
                const firstItemName =
                  order.items[0]?.productName ?? 'Ordered Product';
                const extraItemsCount = Math.max(0, order.items.length - 1);
                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="hover:bg-[#F9FAFB] transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-3 font-bold text-[#111827]">
                      <div>{formatOrderIdLabel(order.orderNumber)}</div>
                      <div className="text-[11px] font-normal text-[#6B7280]">
                        {order.paymentMethod || 'UPI'}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-[#1F2937]">
                      <div className="font-semibold">{order.customerName}</div>
                      <div className="text-[11.5px] text-[#6B7280] truncate max-w-[180px]">
                        {order.customerPhone ||
                          order.deliveryAddress.phoneNumber ||
                          'Phone number not available'}
                      </div>
                      {order.customerEmail ? (
                        <div className="text-[11px] text-[#9CA3AF] truncate max-w-[180px]">
                          {order.customerEmail}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-3 text-[#374151]">
                      <div className="font-medium text-[13px] truncate max-w-[230px]">
                        {order.items.length > 0
                          ? `${firstItemName}${extraItemsCount > 0 ? ` +${extraItemsCount} more` : ''}`
                          : `${order.itemCount} item${order.itemCount === 1 ? '' : 's'}`}
                      </div>
                      <div className="text-[11.5px] text-[#6B7280] truncate max-w-[230px]">
                        {order.itemCount} qty •{' '}
                        {order.vendorNames.length > 0
                          ? order.vendorNames.join(', ')
                          : 'Verified Store'}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-[#6B7280] text-[13px]">
                      {formatDisplayDateTime(order.createdAt)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-[#111827]">
                      {formatINR(order.amount)}
                    </td>
                    <td
                      className="py-3.5 px-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={order.status}
                        onChange={(e) => {
                          void handleStatusChange(
                            order.id,
                            e.target.value as OrderOverallStatus
                          );
                        }}
                        className={[
                          'px-3 py-1 rounded-full text-[12px] font-semibold border-0 cursor-pointer focus:outline-none',
                          badge.className,
                        ].join(' ')}
                      >
                        <option value="placed">Placed</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td
                      className="py-3.5 px-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="px-3 py-1.5 rounded-xl bg-[#EAF7EF] text-[#15803D] hover:bg-[#DCFCE7] text-[12.5px] font-bold transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Admin Order Details Modal */}
      {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6 overflow-y-auto"
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#ECEEF2] bg-[#F9FAFB] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[18px] sm:text-[20px] font-extrabold text-[#111827]">
                    Order {formatOrderIdLabel(selectedOrder.orderNumber)}
                  </h2>
                  <span
                    className={[
                      'px-2.5 py-0.5 rounded-full text-[11.5px] font-bold',
                      getOrderStatusBadge(selectedOrder.status).className,
                    ].join(' ')}
                  >
                    {getOrderStatusBadge(selectedOrder.status).label}
                  </span>
                  {selectedOrder.suborders.length > 1 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#1D4ED8]">
                      Multi-Vendor ({selectedOrder.suborders.length} Stores)
                    </span>
                  ) : null}
                </div>
                <p className="text-[12px] text-[#6B7280] mt-0.5">
                  Document ID: <span className="font-mono">{selectedOrder.id}</span> • Placed on{' '}
                  {formatDisplayDateTime(selectedOrder.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <select
                  value={selectedOrder.status}
                  onChange={(e) => {
                    void handleStatusChange(
                      selectedOrder.id,
                      e.target.value as OrderOverallStatus
                    );
                  }}
                  className={[
                    'px-3 py-1.5 rounded-xl text-[12.5px] font-bold border border-[#E5E7EB] cursor-pointer focus:outline-none',
                    getOrderStatusBadge(selectedOrder.status).className,
                  ].join(' ')}
                >
                  <option value="placed">Placed</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedOrderId(null)}
                  className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F3F4F6] text-[12.5px] font-semibold"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Top Info Grid: Customer, Delivery Address, Payment & Totals */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer Info */}
                <div className="rounded-xl border border-[#ECEEF2] bg-[#F9FAFB] p-4">
                  <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                    Customer Details
                  </div>
                  <div className="text-[14.5px] font-bold text-[#111827]">
                    {selectedOrder.customerName}
                  </div>
                  <div className="mt-1.5 space-y-1 text-[12.5px] text-[#4B5563]">
                    <div>
                      <span className="font-semibold text-[#374151]">Phone:</span>{' '}
                      {selectedOrder.customerPhone ||
                        selectedOrder.deliveryAddress.phoneNumber ||
                        'Phone number not available'}
                    </div>
                    <div>
                      <span className="font-semibold text-[#374151]">Email:</span>{' '}
                      {selectedOrder.customerEmail || 'Not provided'}
                    </div>
                    {selectedOrder.userId ? (
                      <div className="text-[11px] text-[#6B7280] truncate">
                        <span className="font-semibold">Customer UID:</span>{' '}
                        <span className="font-mono">{selectedOrder.userId}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="rounded-xl border border-[#ECEEF2] bg-[#F9FAFB] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Delivery Address
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-[#E5E7EB] text-[11px] font-semibold text-[#374151]">
                      {selectedOrder.deliveryAddress.label || 'Delivery'}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-bold text-[#111827]">
                    {selectedOrder.deliveryAddress.fullName ||
                      selectedOrder.customerName}
                  </div>
                  <div className="text-[12.5px] text-[#4B5563] mt-1 leading-relaxed">
                    {selectedOrder.deliveryAddress.addressLine1 ? (
                      <div>{selectedOrder.deliveryAddress.addressLine1}</div>
                    ) : null}
                    {selectedOrder.deliveryAddress.addressLine2 ? (
                      <div>{selectedOrder.deliveryAddress.addressLine2}</div>
                    ) : null}
                    <div>
                      {[
                        selectedOrder.deliveryAddress.city,
                        selectedOrder.deliveryAddress.state,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      {selectedOrder.deliveryAddress.pincode
                        ? ` - ${selectedOrder.deliveryAddress.pincode}`
                        : ''}
                    </div>
                    <div className="mt-1 font-medium text-[#374151]">
                      Phone:{' '}
                      {selectedOrder.deliveryAddress.phoneNumber ||
                        selectedOrder.customerPhone ||
                        'Phone number not available'}
                    </div>
                  </div>
                </div>

                {/* Payment & Pricing Summary */}
                <div className="rounded-xl border border-[#ECEEF2] bg-[#F9FAFB] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Payment & Summary
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#EAF7EF] text-[#15803D] text-[11px] font-bold uppercase">
                      {selectedOrder.paymentStatus || 'paid'}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-[#374151] mb-2">
                    <span className="font-semibold">Method:</span>{' '}
                    {selectedOrder.paymentMethod || 'UPI'}
                    {selectedOrder.transactionId ? (
                      <span className="block text-[11px] text-[#6B7280] font-mono">
                        TXN: {selectedOrder.transactionId}
                      </span>
                    ) : null}
                  </div>
                  <div className="border-t border-[#E5E7EB] pt-2 space-y-1 text-[12.5px]">
                    <div className="flex justify-between text-[#4B5563]">
                      <span>Total MRP</span>
                      <span>{formatINR(selectedOrder.subtotalMrp)}</span>
                    </div>
                    <div className="flex justify-between text-[#4B5563]">
                      <span>Selling Subtotal</span>
                      <span>{formatINR(selectedOrder.sellingSubtotal)}</span>
                    </div>
                    {selectedOrder.productDiscount > 0 ? (
                      <div className="flex justify-between text-[#15803D]">
                        <span>Product Discount</span>
                        <span>-{formatINR(selectedOrder.productDiscount)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-[#4B5563]">
                      <span>
                        Coupon{' '}
                        {selectedOrder.couponCode
                          ? `(${selectedOrder.couponCode})`
                          : ''}
                      </span>
                      <span>
                        {selectedOrder.couponDiscount > 0
                          ? `-${formatINR(selectedOrder.couponDiscount)}`
                          : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#4B5563]">
                      <span>Delivery Charges</span>
                      <span>
                        {selectedOrder.deliveryCharges > 0
                          ? formatINR(selectedOrder.deliveryCharges)
                          : 'FREE'}
                      </span>
                    </div>
                    <div className="flex justify-between font-extrabold text-[14px] text-[#111827] pt-1 border-t border-[#E5E7EB]">
                      <span>Grand Total</span>
                      <span className="text-[#15803D]">
                        {formatINR(selectedOrder.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ordered Products Table */}
              <div className="rounded-xl border border-[#ECEEF2] overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-3 border-b border-[#ECEEF2] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[14.5px] font-bold text-[#111827]">
                      Ordered Products ({selectedOrder.items.length}{' '}
                      {selectedOrder.items.length === 1 ? 'Product' : 'Products'} •{' '}
                      {selectedOrder.itemCount} Total Qty)
                    </h3>
                    <p className="text-[12px] text-[#6B7280]">
                      Product snapshots captured at the time of checkout across{' '}
                      {selectedOrder.vendorNames.length || 1} store
                      {selectedOrder.vendorNames.length === 1 ? '' : 's'}.
                    </p>
                  </div>
                </div>

                {selectedOrder.items.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-[#6B7280]">
                    No line item snapshots were recorded on this legacy order document.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-white border-b border-[#F3F4F6] text-[#6B7280] text-[12px]">
                          <th className="py-2.5 px-4 text-left font-semibold">
                            Product
                          </th>
                          <th className="py-2.5 px-3 text-left font-semibold">
                            Brand & Category
                          </th>
                          <th className="py-2.5 px-3 text-left font-semibold">
                            Vendor / Store
                          </th>
                          <th className="py-2.5 px-3 text-center font-semibold">
                            Qty
                          </th>
                          <th className="py-2.5 px-3 text-right font-semibold">
                            MRP
                          </th>
                          <th className="py-2.5 px-3 text-right font-semibold">
                            Selling Price
                          </th>
                          <th className="py-2.5 px-4 text-right font-semibold">
                            Subtotal
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6]">
                        {selectedOrder.items.map((item) => (
                          <tr key={item.id} className="hover:bg-[#F9FAFB]">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productName}
                                    className="w-12 h-12 rounded-lg object-cover border border-[#E5E7EB] bg-[#F9FAFB] shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg border border-[#E5E7EB] bg-[#EAF7EF] text-[#15803D] flex items-center justify-center font-bold text-[14px] shrink-0">
                                    {item.productName.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-[#111827]">
                                    {item.productName}
                                  </div>
                                  {item.selectedColor || item.selectedSize ? (
                                    <div className="text-[11.5px] text-[#6B7280]">
                                      {[
                                        item.selectedColor
                                          ? `Color: ${item.selectedColor}`
                                          : '',
                                        item.selectedSize
                                          ? `Size: ${item.selectedSize}`
                                          : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' • ')}
                                    </div>
                                  ) : null}
                                  {item.productId ? (
                                    <div className="text-[11px] text-[#9CA3AF] font-mono">
                                      ID: {item.productId}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-[#374151]">
                                {item.brand || '—'}
                              </div>
                              <div className="text-[11.5px] text-[#6B7280]">
                                {item.categoryName || 'General'}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#EAF7EF] text-[#15803D] font-semibold text-[12px]">
                                {item.vendorName}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-[#111827]">
                              {item.quantity}
                            </td>
                            <td className="py-3 px-3 text-right text-[#6B7280]">
                              {formatINR(item.unitMrp)}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-[#111827]">
                              {formatINR(item.unitSellingPrice)}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-[#111827]">
                              {formatINR(item.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Multi-Vendor Shipments & Order Status History */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Vendor Suborders / Shipments */}
                <div className="rounded-xl border border-[#ECEEF2] p-4">
                  <h4 className="text-[13.5px] font-bold text-[#111827] mb-3">
                    Vendor Suborders & Shipments ({selectedOrder.suborders.length || 1})
                  </h4>
                  {selectedOrder.suborders.length === 0 ? (
                    <div className="text-[12.5px] text-[#6B7280]">
                      Store:{' '}
                      <span className="font-semibold text-[#111827]">
                        {selectedOrder.vendorNames.join(', ') || 'Verified Store'}
                      </span>{' '}
                      • Status:{' '}
                      <span className="font-semibold capitalize">
                        {selectedOrder.status}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedOrder.suborders.map((sub) => (
                        <div
                          key={sub.id}
                          className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-[12.5px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#111827]">
                              {sub.vendorName}{' '}
                              <span className="text-[11px] font-normal text-[#6B7280]">
                                ({sub.suborderNumber})
                              </span>
                            </span>
                            <span
                              className={[
                                'px-2 py-0.5 rounded-full text-[11px] font-bold capitalize',
                                getOrderStatusBadge(sub.status).className,
                              ].join(' ')}
                            >
                              {sub.status}
                            </span>
                          </div>
                          <div className="text-[#4B5563] mt-1 flex flex-wrap justify-between gap-2">
                            <span>
                              {sub.items.length} item
                              {sub.items.length === 1 ? '' : 's'} • Subtotal:{' '}
                              <strong className="text-[#111827]">
                                {formatINR(sub.sellingSubtotal)}
                              </strong>
                            </span>
                            {sub.carrierName || sub.trackingNumber ? (
                              <span className="text-[11.5px] text-[#6B7280]">
                                {sub.carrierName || 'Carrier'} •{' '}
                                <span className="font-mono">
                                  {sub.trackingNumber}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status History Timeline */}
                <div className="rounded-xl border border-[#ECEEF2] p-4">
                  <h4 className="text-[13.5px] font-bold text-[#111827] mb-3">
                    Order Status History
                  </h4>
                  {selectedOrder.statusHistory.length === 0 ? (
                    <div className="text-[12.5px] text-[#6B7280]">
                      Order placed on{' '}
                      {formatDisplayDateTime(selectedOrder.createdAt)} • Current
                      status:{' '}
                      <span className="font-semibold capitalize text-[#111827]">
                        {selectedOrder.status}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {selectedOrder.statusHistory.map((hist) => (
                        <div
                          key={hist.id}
                          className="flex items-start gap-2.5 text-[12.5px]"
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[#111827]">
                                {hist.title}
                              </span>
                              <span className="text-[11px] text-[#6B7280]">
                                {formatDisplayDateTime(hist.createdAt)}
                              </span>
                            </div>
                            {hist.description ? (
                              <p className="text-[#4B5563] text-[12px] mt-0.5">
                                {hist.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>([]);

  useEffect(() => subscribeCustomers(setCustomers), []);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Registered ZemiGo shoppers from the shared `users` Firestore collection."
      />

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] text-[#4B5563] text-[12.5px]">
              <th className="py-2.5 px-3 text-left rounded-l-lg font-medium">
                Customer Name
              </th>
              <th className="py-2.5 px-3 text-left font-medium">Email</th>
              <th className="py-2.5 px-3 text-left font-medium">Phone</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg font-medium">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
            {customers.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-10 text-center text-[13.5px] text-[#6B7280]"
                >
                  No customers recorded in Firestore (`users` collection) yet.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 px-3 font-bold text-[#111827]">
                    {c.fullName}
                  </td>
                  <td className="py-3 px-3 text-[#4B5563]">{c.email || '—'}</td>
                  <td className="py-3 px-3 text-[#4B5563]">
                    {c.mobileNumber || '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-[#6B7280]">
                    {c.createdAt.getTime() > 0
                      ? formatDisplayDate(c.createdAt)
                      : '—'}
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

export const CouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<AdminCouponRecord[]>([]);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>(
    'flat'
  );
  const [discountValue, setDiscountValue] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('999');
  const [couponMsg, setCouponMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => subscribeCoupons(setCoupons), []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponMsg(null);
    if (!code.trim() || !discountValue) {
      setCouponMsg({
        type: 'error',
        text: 'Coupon code and discount value are required.',
      });
      return;
    }
    try {
      await createCouponInFirestore({
        code,
        title: title || `${code.toUpperCase()} Offer`,
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: Number(minOrderValue) || 0,
      });
      setCouponMsg({
        type: 'success',
        text: `Coupon ${code.trim().toUpperCase()} created in Firestore.`,
      });
      setCode('');
      setTitle('');
      setDiscountValue('');
    } catch (err) {
      setCouponMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to create coupon.',
      });
    }
  };

  const handleToggleCoupon = async (coupon: AdminCouponRecord) => {
    setCouponMsg(null);
    try {
      await toggleCouponActiveInFirestore(coupon.id, !coupon.active);
      setCouponMsg({
        type: 'success',
        text: `Coupon ${coupon.code} is now ${!coupon.active ? 'Active' : 'Paused'}.`,
      });
    } catch (err) {
      setCouponMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update coupon.',
      });
    }
  };

  const handleDeleteCoupon = async (coupon: AdminCouponRecord) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete coupon "${coupon.code}" permanently?`)
    ) {
      return;
    }
    setCouponMsg(null);
    try {
      await deleteCouponInFirestore(coupon.id);
      setCouponMsg({
        type: 'success',
        text: `Coupon ${coupon.code} deleted.`,
      });
    } catch (err) {
      setCouponMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete coupon.',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Coupons & Offers"
        subtitle="Promotional discount codes redeemable in ZemiGo My Cart & Checkout."
      />

      {couponMsg ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium ${
            couponMsg.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          {couponMsg.text}
        </div>
      ) : null}

      <form
        onSubmit={handleCreate}
        className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code (e.g. ZEMIGO500)"
          required
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] uppercase"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Offer Title"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <select
          value={discountType}
          onChange={(e) =>
            setDiscountType(e.target.value as 'percentage' | 'flat')
          }
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px] bg-white"
        >
          <option value="flat">Flat ₹ Discount</option>
          <option value="percentage">Percentage %</option>
        </select>
        <input
          type="number"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          placeholder="Discount Value"
          required
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <input
          type="number"
          value={minOrderValue}
          onChange={(e) => setMinOrderValue(e.target.value)}
          placeholder="Min Order (₹)"
          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-[13.5px]"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13.5px] py-2.5 px-4"
        >
          Create Coupon
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {coupons.length === 0 ? (
          <div className="md:col-span-3 bg-white rounded-2xl border border-[#ECEEF2] p-10 text-center text-[13.5px] text-[#6B7280]">
            No coupons created in Firestore (`coupons` collection) yet.
          </div>
        ) : (
          coupons.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5"
            >
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-lg bg-[#EAF7EF] text-[#15803D] font-extrabold text-[13.5px]">
                  {c.code}
                </span>
                <span className="text-[13px] font-bold text-[#111827]">
                  {c.discountType === 'percentage'
                    ? `${c.discountValue}% OFF`
                    : `${formatINR(c.discountValue)} OFF`}
                </span>
              </div>
              <p className="text-[13.5px] font-medium text-[#374151] mt-3">
                {c.title}
              </p>
              <p className="text-[12px] text-[#6B7280] mt-1">
                Min. order: {formatINR(c.minOrderValue)} • Status:{' '}
                <strong className={c.active ? 'text-[#15803D]' : 'text-[#6B7280]'}>
                  {c.active ? 'Active' : 'Paused'}
                </strong>
              </p>
              <div className="mt-4 pt-3 border-t border-[#F3F4F6] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleCoupon(c)}
                  className="rounded-lg border border-[#D1D5DB] hover:border-[#16A34A] px-2.5 py-1 text-[12px] font-semibold text-[#374151]"
                >
                  {c.active ? 'Pause' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCoupon(c)}
                  className="rounded-lg border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1 text-[12px] font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const CommissionPage: React.FC = () => {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<AdminVendorRecord[]>([]);
  const [commissions, setCommissions] = useState<AdminCommissionRecord[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings>({
    defaultCommissionPercent: 8,
    freeDeliveryThreshold: 499,
    supportEmail: 'support@zemigo.in',
  });
  const [defaultRate, setDefaultRate] = useState('8');
  const [vendorRates, setVendorRates] = useState<Record<string, string>>({});
  const [savingVendorId, setSavingVendorId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeVendors(setVendors, (err) => {
        setSavedMsg(`Firestore error reading vendors: ${err.message}`);
      }),
    [user?.uid]
  );
  useEffect(() => subscribeCommissions(setCommissions), []);
  useEffect(
    () =>
      subscribeMarketplaceSettings(
        (liveSettings) => {
          setSettings(liveSettings);
          setDefaultRate(String(liveSettings.defaultCommissionPercent));
        },
        (err) => {
          setSavedMsg(`Firestore error reading settings: ${err.message}`);
        }
      ),
    []
  );

  const handleSaveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(defaultRate);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 50) {
      setSavedMsg('Default commission rate must be between 0% and 50%.');
      return;
    }
    try {
      await saveMarketplaceSettingsInFirestore({
        defaultCommissionPercent: numeric,
        freeDeliveryThreshold: settings.freeDeliveryThreshold,
        supportEmail: settings.supportEmail,
      });
      setSavedMsg(
        `Default marketplace commission updated to ${numeric}% in Firestore.`
      );
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Unable to save.');
    }
  };

  const handleSaveVendorRate = async (vendor: AdminVendorRecord) => {
    const raw =
      vendorRates[vendor.id] ??
      String(vendor.commissionRate ?? settings.defaultCommissionPercent);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 50) {
      setSavedMsg(
        `Commission rate for ${vendor.storeName} must be between 0% and 50%.`
      );
      return;
    }

    setSavingVendorId(vendor.id);
    setSavedMsg(null);
    try {
      await updateVendorCommissionRateInFirestore(vendor.id, numeric);
      setSavedMsg(
        `Updated ${vendor.storeName} commission rate to ${numeric}% in Firestore.`
      );
    } catch (err) {
      setSavedMsg(
        err instanceof Error ? err.message : 'Unable to update vendor rate.'
      );
    } finally {
      setSavingVendorId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Commission"
        subtitle="Configure platform and vendor-specific commission percentages from Firestore."
      />

      <form
        onSubmit={handleSaveDefault}
        className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 mb-6 flex flex-wrap items-end gap-4"
      >
        <div>
          <label className="block text-[13px] font-semibold text-[#374151] mb-1">
            Default Platform Commission (%) — live in settings/marketplace
          </label>
          <input
            type="number"
            min={0}
            max={50}
            step="0.5"
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
            className="w-48 rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px]"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[14px] px-5 py-2.5"
        >
          Save Commission Rule
        </button>
        {savedMsg ? (
          <span className="text-[13px] font-medium text-[#15803D]">
            {savedMsg}
          </span>
        ) : null}
      </form>

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-[16px] font-bold text-[#111827]">
            Vendor-Specific Commission Rates
          </h2>
          <span className="text-[12.5px] text-[#6B7280]">
            Fallback if unset: {settings.defaultCommissionPercent}% (Platform
            Default)
          </span>
        </div>
        {vendors.length === 0 ? (
          <p className="text-[13.5px] text-[#6B7280] py-6 text-center">
            No vendors registered yet.
          </p>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            {vendors.map((v) => {
              const effectiveRate =
                v.commissionRate ?? settings.defaultCommissionPercent;
              const draftValue =
                vendorRates[v.id] ?? String(effectiveRate);
              const isSaving = savingVendorId === v.id;
              return (
                <div
                  key={v.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-[14px]"
                >
                  <div>
                    <span className="font-semibold text-[#111827]">
                      {v.storeName}
                    </span>
                    <span className="ml-2 text-[12px] text-[#6B7280]">
                      ({v.commissionRate !== undefined ? 'Custom' : 'Default'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-xl border border-[#E5E7EB] px-2.5 py-1.5 bg-white">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step="0.5"
                        aria-label={`Commission rate for ${v.storeName}`}
                        value={draftValue}
                        onChange={(e) =>
                          setVendorRates((prev) => ({
                            ...prev,
                            [v.id]: e.target.value,
                          }))
                        }
                        className="w-16 text-[13.5px] font-bold text-[#15803D] outline-none bg-transparent"
                      />
                      <span className="text-[13px] font-semibold text-[#6B7280]">
                        %
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveVendorRate(v)}
                      className="rounded-xl border border-[#D1D5DB] hover:border-[#16A34A] hover:text-[#15803D] px-3 py-1.5 text-[12.5px] font-semibold text-[#374151] transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {commissions.length > 0 ? (
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-5 mt-6">
          <h2 className="text-[16px] font-bold text-[#111827] mb-3">
            Recorded Order Commissions (`commissions` collection)
          </h2>
          <div className="divide-y divide-[#F3F4F6] text-[13.5px]">
            {commissions.map((c) => (
              <div
                key={c.id}
                className="py-2.5 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-[#111827]">
                    {c.vendorName}
                  </span>
                  {c.orderId ? (
                    <span className="ml-2 text-[#6B7280]">
                      ({formatOrderIdLabel(c.orderId)})
                    </span>
                  ) : null}
                </div>
                <span className="font-bold text-[#15803D]">
                  {formatINR(c.commissionAmount)} ({c.commissionRate}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const PaymentsPage: React.FC = () => <FinancialAnalyticsPage />;

export const ReportsPage: React.FC = () => <FinancialAnalyticsPage />;

export const SettingsPage: React.FC = () => {
  const [defaultCommissionPercent, setDefaultCommissionPercent] = useState(8);
  const [supportEmail, setSupportEmail] = useState('support@zemigo.in');
  const [freeDeliveryMin, setFreeDeliveryMin] = useState('499');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeMarketplaceSettings((liveSettings) => {
        setDefaultCommissionPercent(liveSettings.defaultCommissionPercent);
        setSupportEmail(liveSettings.supportEmail);
        setFreeDeliveryMin(String(liveSettings.freeDeliveryThreshold));
      }),
    []
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMarketplaceSettingsInFirestore({
        defaultCommissionPercent,
        freeDeliveryThreshold: Number(freeDeliveryMin) || 499,
        supportEmail,
      });
      setStatusMessage('Settings saved to Firestore.');
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Unable to save settings.'
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="ZemiGo Admin Panel & shared Firebase database configuration."
      />

      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-6 max-w-2xl space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-[#F3F4F6]">
          <div>
            <p className="font-bold text-[#111827]">
              Shared Firebase Connection
            </p>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Compatible with ZemiGo Expo Customer App (`orders`, `vendors`,
              `products`, `categories`, `banners`, `users`, `coupons`).
            </p>
          </div>
          <span
            className={[
              'px-3 py-1 rounded-full text-[12px] font-semibold shrink-0',
              isFirebaseConfigured
                ? 'bg-[#DCFCE7] text-[#15803D]'
                : 'bg-[#FEF3C7] text-[#D97706]',
            ].join(' ')}
          >
            {isFirebaseConfigured ? 'Connected' : 'Configure .env'}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1">
              Admin / Support Email
            </label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1">
              Free Delivery Minimum Order (₹)
            </label>
            <input
              type="number"
              value={freeDeliveryMin}
              onChange={(e) => setFreeDeliveryMin(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-[14px]"
            />
          </div>

          {statusMessage ? (
            <p className="text-[13px] font-medium text-[#15803D]">
              {statusMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[14px] px-5 py-2.5"
          >
            Save Settings
          </button>
        </form>
      </div>
    </div>
  );
};
