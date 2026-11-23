/**
 * Shared ZemiGo Admin & Customer App Data Contracts.
 * Designed to map 1:1 with the ZemiGo React Native customer app schemas
 * (`orders`, `vendors`, `products`, `categories`, `banners`, `users`, `coupons`)
 * so both apps share the exact same Firestore collections without transformation friction.
 */

export type OrderOverallStatus =
  | 'placed'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type SalesRangeKey = '7d' | '14d' | '30d';

export interface AdminOrderItemDetail {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  categoryName: string;
  imageUrl?: string;
  quantity: number;
  unitSellingPrice: number;
  unitMrp: number;
  lineTotal: number;
  vendorId: string;
  vendorName: string;
  suborderId?: string;
  selectedColor?: string;
  selectedSize?: string;
}

export interface AdminVendorSuborderDetail {
  id: string;
  suborderNumber: string;
  vendorId: string;
  vendorName: string;
  vendorCity?: string;
  status: OrderOverallStatus;
  currentMilestone?: string;
  subtotalMrp: number;
  sellingSubtotal: number;
  vendorDiscount: number;
  carrierName?: string;
  trackingNumber?: string;
  estimatedDeliveryAt?: string;
  items: AdminOrderItemDetail[];
}

export interface AdminOrderAddressDetail {
  label: string;
  fullName: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface AdminOrderHistoryEntry {
  id: string;
  suborderId?: string | null;
  milestone: string;
  status: OrderOverallStatus;
  title: string;
  description: string;
  createdAt: Date;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  userId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  amount: number;
  subtotalMrp: number;
  sellingSubtotal: number;
  productDiscount: number;
  couponCode?: string;
  couponDiscount: number;
  deliveryCharges: number;
  status: OrderOverallStatus;
  currentMilestone?: string;
  createdAt: Date;
  vendorIds: string[];
  vendorNames: string[];
  itemCount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  transactionId?: string;
  deliveryAddress: AdminOrderAddressDetail;
  items: AdminOrderItemDetail[];
  suborders: AdminVendorSuborderDetail[];
  statusHistory: AdminOrderHistoryEntry[];
}

export interface AdminVendorRecord {
  id: string;
  storeName: string;
  email?: string;
  phone?: string;
  categoryLabel: string;
  city: string;
  rating: number;
  verified: boolean;
  active: boolean;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  logoUrl?: string;
  commissionRate?: number;
  totalOrders: number;
  totalSales: number;
  totalPayoutsPaid?: number;
  pendingPayoutBalance?: number;
  lastPayoutReference?: string;
  createdAt: Date;
}

export interface AdminProductRecord {
  id: string;
  name: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  vendorId: string;
  vendorName: string;
  price: number;
  originalPrice: number;
  stockQuantity?: number;
  inStock: boolean;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  rating: number;
  imageUrl?: string;
  createdAt: Date;
}

export interface AdminCategoryRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  iconUrl?: string;
  displayOrder: number;
  productCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export type BannerTargetType = 'none' | 'category' | 'product' | 'link';

export interface AdminBannerRecord {
  id: string;
  title: string;
  subtitle: string;
  discountText: string;
  discountPrefix?: string;
  discountHighlight?: string;
  buttonText: string;
  targetType: BannerTargetType;
  targetCategoryId?: string;
  targetCategoryName?: string;
  targetProductId?: string;
  targetProductName?: string;
  navigationTarget?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  displayOrder: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AdminCustomerRecord {
  id: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  city?: string;
  ordersCount: number;
  totalSpent: number;
  createdAt: Date;
}

export interface AdminCouponRecord {
  id: string;
  code: string;
  title: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  active: boolean;
}

export interface MarketplaceSettings {
  defaultCommissionPercent: number;
  freeDeliveryThreshold: number;
  supportEmail: string;
  updatedAt?: Date;
}

export type PayoutPaymentMethod =
  | 'Bank Transfer (NEFT/IMPS)'
  | 'UPI'
  | 'RTGS'
  | 'Cheque';

export interface AdminPayoutRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  grossAmount: number;
  commissionAmount: number;
  commissionRate?: number;
  netPayout: number;
  status: 'pending' | 'processing' | 'paid';
  paymentMethod?: string;
  referenceId?: string;
  payoutDate?: string;
  notes?: string;
  recordedBy?: string;
  paidAt?: Date;
  createdAt: Date;
}

export interface AdminCommissionRecord {
  id: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  createdAt: Date;
}

export interface SalesOverviewPoint {
  dateKey: string;
  label: string;
  sales: number;
  orders: number;
}

export interface OrderStatusSlice {
  status: OrderOverallStatus;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface DashboardMetrics {
  totalOrders: number;
  ordersDeltaPercent: number | null;
  totalSales: number;
  salesDeltaPercent: number | null;
  activeVendors: number;
  vendorsDeltaPercent: number | null;
  totalCustomers: number;
  customersDeltaPercent: number | null;
  salesSeries: SalesOverviewPoint[];
  orderStatusSlices: OrderStatusSlice[];
  recentOrders: AdminOrderSummary[];
  topVendors: AdminVendorRecord[];
}
