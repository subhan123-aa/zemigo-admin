import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { ZEMIGO_COLLECTIONS, firestoreDb } from '@/lib/firebase';
import type {
  AdminBannerRecord,
  AdminCategoryRecord,
  AdminCommissionRecord,
  AdminCouponRecord,
  AdminCustomerRecord,
  AdminOrderAddressDetail,
  AdminOrderHistoryEntry,
  AdminOrderItemDetail,
  AdminOrderSummary,
  AdminPayoutRecord,
  AdminProductRecord,
  AdminVendorRecord,
  AdminVendorSuborderDetail,
  ApprovalStatus,
  MarketplaceSettings,
  OrderOverallStatus,
  PayoutPaymentMethod,
} from '@/types/admin';

function parseApprovalStatus(
  rawStatus: unknown,
  fallbackApproved: boolean
): ApprovalStatus {
  const s = String(rawStatus ?? '').toLowerCase().trim();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'pending') return 'pending';
  return fallbackApproved ? 'approved' : 'pending';
}

function parseFirestoreDate(raw: unknown): Date {
  if (!raw) return new Date(0);
  if (raw instanceof Timestamp) return raw.toDate();
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'seconds' in raw &&
    typeof (raw as { seconds: unknown }).seconds === 'number'
  ) {
    return new Date((raw as { seconds: number }).seconds * 1000);
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

const ORDER_STAGE_STEPS: readonly {
  milestone: string;
  status: Exclude<OrderOverallStatus, 'cancelled'>;
  title: string;
  description: string;
}[] = [
  {
    milestone: 'order_placed',
    status: 'placed',
    title: 'Order Placed',
    description: 'Order received',
  },
  {
    milestone: 'order_confirmed',
    status: 'confirmed',
    title: 'Confirmed',
    description: 'Seller confirmed your order',
  },
  {
    milestone: 'packed',
    status: 'processing',
    title: 'Processing',
    description: 'Packing your order',
  },
  {
    milestone: 'shipped',
    status: 'shipped',
    title: 'Shipped',
    description: 'Your order is on the way',
  },
  {
    milestone: 'out_for_delivery',
    status: 'out_for_delivery',
    title: 'Out for Delivery',
    description: 'Delivery partner is nearby',
  },
  {
    milestone: 'delivered',
    status: 'delivered',
    title: 'Delivered',
    description: 'Order successfully delivered',
  },
] as const;

function parseRawStatusToken(raw: unknown): OrderOverallStatus | null {
  const str = String(raw ?? '').toLowerCase().trim();
  if (str === 'placed' || str === 'order_placed') return 'placed';
  if (str === 'confirmed' || str === 'order_confirmed') return 'confirmed';
  if (str === 'processing' || str === 'packed' || str === 'order_processing') {
    return 'processing';
  }
  if (str === 'shipped') return 'shipped';
  if (str === 'out_for_delivery' || str === 'in_transit') {
    return 'out_for_delivery';
  }
  if (str === 'delivered' || str === 'completed') return 'delivered';
  if (str === 'cancelled' || str === 'canceled') return 'cancelled';
  return null;
}

function mapStatusToCanonicalMilestone(
  status: OrderOverallStatus,
  fallbackMilestone = 'order_placed'
): string {
  const found = ORDER_STAGE_STEPS.find((s) => s.status === status);
  return found ? found.milestone : fallbackMilestone;
}

function reconcileAdminOrderStage(
  rawStatus: unknown,
  rawMilestone: unknown,
  _historyRaw: Record<string, unknown>[] = []
): { status: OrderOverallStatus; milestone: string } {
  const parsedStatus = parseRawStatusToken(rawStatus);
  const milestoneStr = String(rawMilestone ?? '').toLowerCase().trim();

  if (parsedStatus === 'cancelled') {
    return {
      status: 'cancelled',
      milestone: milestoneStr || 'order_placed',
    };
  }

  if (parsedStatus === 'processing') {
    if (milestoneStr === 'packed' || milestoneStr === 'processing') {
      return { status: 'processing', milestone: 'packed' };
    }
    if (milestoneStr === 'order_confirmed' || milestoneStr === 'confirmed') {
      return { status: 'processing', milestone: 'packed' };
    }
    if (milestoneStr === 'order_placed' || !milestoneStr) {
      return { status: 'processing', milestone: 'packed' };
    }
  }

  if (parsedStatus) {
    return {
      status: parsedStatus,
      milestone: mapStatusToCanonicalMilestone(parsedStatus),
    };
  }

  const byMilestone = ORDER_STAGE_STEPS.find(
    (s) => s.milestone === milestoneStr
  );
  if (byMilestone) {
    return { status: byMilestone.status, milestone: byMilestone.milestone };
  }

  return { status: 'placed', milestone: 'order_placed' };
}

function normalizeStatus(raw: unknown): OrderOverallStatus {
  return parseRawStatusToken(raw) ?? 'placed';
}

function isDispatchedStage(status: OrderOverallStatus): boolean {
  return (
    status === 'shipped' ||
    status === 'out_for_delivery' ||
    status === 'delivered'
  );
}

function resolveOrderItemImageUrl(rawItem: Record<string, unknown>): string | undefined {
  const candidates = [
    rawItem.image_url,
    rawItem.imageUrl,
    rawItem.thumbnail,
    rawItem.image,
    rawItem.productImage,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

export function sanitizeCustomerPhone(
  raw: unknown,
  isDefaultTemplateAddress = false
): string {
  const val = String(raw ?? '').trim();
  if (
    !val ||
    val.toLowerCase() === 'not provided' ||
    val.toLowerCase() === 'phone number not available'
  ) {
    return '';
  }
  if (isDefaultTemplateAddress && val === '9876543210') {
    return '';
  }
  return val;
}

export function extractCustomerPhoneFromProfile(
  userData: Record<string, unknown>
): string {
  return sanitizeCustomerPhone(
    userData.mobileNumber ??
      userData.mobile_number ??
      userData.phone ??
      userData.phoneNumber ??
      userData.customerPhone ??
      userData.customer_phone
  );
}

function mapAdminOrderItem(
  rawItem: Record<string, unknown>,
  idx: number,
  fallbackVendorId = '',
  fallbackVendorName = 'Verified Store',
  fallbackSuborderId?: string
): AdminOrderItemDetail {
  const quantity = Math.max(1, Number(rawItem.quantity ?? rawItem.qty ?? 1) || 1);
  const unitSellingPrice =
    Number(
      rawItem.unit_selling_price ??
        rawItem.unitSellingPrice ??
        rawItem.selling_price ??
        rawItem.sellingPrice ??
        rawItem.price ??
        0
    ) || 0;
  const unitMrp =
    Number(
      rawItem.unit_mrp ??
        rawItem.unitMrp ??
        rawItem.mrp ??
        rawItem.originalPrice ??
        rawItem.original_price ??
        unitSellingPrice
    ) || unitSellingPrice;
  const lineTotal =
    Number(
      rawItem.line_total ??
        rawItem.lineTotal ??
        rawItem.subtotal ??
        unitSellingPrice * quantity
    ) || unitSellingPrice * quantity;

  const vendorId = String(
    rawItem.vendor_id ??
      rawItem.vendorId ??
      rawItem.vendorUid ??
      fallbackVendorId ??
      ''
  ).trim();
  const vendorName = String(
    rawItem.vendor_name ??
      rawItem.vendorName ??
      fallbackVendorName ??
      'Verified Store'
  ).trim();

  const selectedColorRaw = rawItem.selected_color ?? rawItem.selectedColor;
  const selectedSizeRaw = rawItem.selected_size ?? rawItem.selectedSize;
  const suborderIdRaw = rawItem.suborder_id ?? rawItem.suborderId ?? fallbackSuborderId;

  return {
    id: String(rawItem.id ?? `item_${idx + 1}`),
    productId: String(rawItem.product_id ?? rawItem.productId ?? ''),
    productName: String(
      rawItem.product_name ??
        rawItem.productName ??
        rawItem.name ??
        rawItem.title ??
        'Ordered Product'
    ),
    brand: String(rawItem.brand ?? rawItem.brandName ?? ''),
    categoryName: String(
      rawItem.category_name ??
        rawItem.categoryName ??
        rawItem.category ??
        'General'
    ),
    imageUrl: resolveOrderItemImageUrl(rawItem),
    quantity,
    unitSellingPrice,
    unitMrp: Math.max(unitMrp, unitSellingPrice),
    lineTotal,
    vendorId,
    vendorName: vendorName || 'Verified Store',
    suborderId: typeof suborderIdRaw === 'string' && suborderIdRaw ? suborderIdRaw : undefined,
    selectedColor:
      typeof selectedColorRaw === 'string' && selectedColorRaw.trim()
        ? selectedColorRaw.trim()
        : undefined,
    selectedSize:
      typeof selectedSizeRaw === 'string' && selectedSizeRaw.trim()
        ? selectedSizeRaw.trim()
        : undefined,
  };
}

/**
 * Maps a raw Firestore `orders` document (written by either the ZemiGo React Native
 * customer app or Admin Panel) into `AdminOrderSummary`.
 */
export function mapOrderDoc(
  id: string,
  data: Record<string, unknown>
): AdminOrderSummary {
  const deliveryAddr =
    typeof data.delivery_address === 'object' && data.delivery_address !== null
      ? (data.delivery_address as Record<string, unknown>)
      : typeof data.deliveryAddress === 'object' &&
          data.deliveryAddress !== null
        ? (data.deliveryAddress as Record<string, unknown>)
        : typeof data.shipping_address === 'object' &&
            data.shipping_address !== null
          ? (data.shipping_address as Record<string, unknown>)
          : {};

  const orderItemsRaw = Array.isArray(data.order_items)
    ? (data.order_items as Record<string, unknown>[])
    : Array.isArray(data.items)
      ? (data.items as Record<string, unknown>[])
      : [];

  const vendorSubordersRaw = Array.isArray(data.vendor_suborders)
    ? (data.vendor_suborders as Record<string, unknown>[])
    : [];

  const vendorIdSet = new Set<string>();
  const vendorNameSet = new Set<string>();

  if (Array.isArray(data.vendorIds)) {
    for (const vId of data.vendorIds) {
      if (typeof vId === 'string' && vId.trim()) vendorIdSet.add(vId.trim());
    }
  }
  if (Array.isArray(data.vendorNames)) {
    for (const vName of data.vendorNames) {
      if (typeof vName === 'string' && vName.trim()) vendorNameSet.add(vName.trim());
    }
  }

  const orderNumber = String(data.order_number ?? data.orderNumber ?? id);
  const rawHistoryForStage = Array.isArray(data.order_status_history)
    ? (data.order_status_history as Record<string, unknown>[])
    : [];
  const parentStage = reconcileAdminOrderStage(
    data.overall_status ?? data.status,
    data.current_milestone,
    rawHistoryForStage
  );

  const suborders: AdminVendorSuborderDetail[] = vendorSubordersRaw.map(
    (sub, subIdx) => {
      const vendorObj =
        typeof sub.vendor === 'object' && sub.vendor !== null
          ? (sub.vendor as Record<string, unknown>)
          : {};
      const shipmentObj =
        typeof sub.shipment === 'object' && sub.shipment !== null
          ? (sub.shipment as Record<string, unknown>)
          : {};

      const vId = String(
        vendorObj.vendor_id ??
          vendorObj.vendorId ??
          sub.vendor_id ??
          sub.vendorId ??
          ''
      ).trim();
      const vName = String(
        vendorObj.store_name ??
          vendorObj.storeName ??
          sub.vendor_name ??
          sub.vendorName ??
          'Verified Store'
      ).trim();
      const vCity = String(vendorObj.city ?? sub.city ?? '').trim();

      if (vId) vendorIdSet.add(vId);
      if (vName) vendorNameSet.add(vName);

      const subId = String(sub.id ?? `sub_${subIdx + 1}`);
      const subItemsRaw = Array.isArray(sub.items)
        ? (sub.items as Record<string, unknown>[])
        : [];
      const subItems = subItemsRaw.map((item, itemIdx) =>
        mapAdminOrderItem(item, itemIdx, vId, vName, subId)
      );

      const computedSubSelling = subItems.reduce(
        (sum, it) => sum + it.lineTotal,
        0
      );
      const computedSubMrp = subItems.reduce(
        (sum, it) => sum + it.unitMrp * it.quantity,
        0
      );

      const sellingSubtotal =
        Number(
          sub.selling_subtotal ?? sub.sellingSubtotal ?? computedSubSelling
        ) || computedSubSelling;
      const subtotalMrp =
        Number(sub.subtotal_mrp ?? sub.subtotalMrp ?? computedSubMrp) ||
        computedSubMrp;
      const vendorDiscount =
        Number(
          sub.vendor_discount ??
            sub.vendorDiscount ??
            Math.max(0, subtotalMrp - sellingSubtotal)
        ) || 0;

      const subStage = reconcileAdminOrderStage(
        sub.status ?? data.overall_status ?? data.status,
        sub.current_milestone ?? data.current_milestone,
        rawHistoryForStage.filter(
          (h) => h.suborder_id === subId || h.suborder_id === null
        )
      );
      const subDispatched = isDispatchedStage(subStage.status);

      return {
        id: subId,
        suborderNumber: String(
          sub.suborder_number ??
            sub.suborderNumber ??
            `${orderNumber}-V${subIdx + 1}`
        ),
        vendorId: vId,
        vendorName: vName || 'Verified Store',
        vendorCity: vCity || undefined,
        status: subStage.status,
        currentMilestone: subStage.milestone,
        subtotalMrp,
        sellingSubtotal,
        vendorDiscount,
        carrierName:
          subDispatched &&
          typeof shipmentObj.carrier_name === 'string' &&
          shipmentObj.carrier_name.trim()
            ? shipmentObj.carrier_name
            : undefined,
        trackingNumber:
          subDispatched &&
          typeof shipmentObj.tracking_number === 'string' &&
          shipmentObj.tracking_number.trim()
            ? shipmentObj.tracking_number
            : undefined,
        estimatedDeliveryAt:
          subDispatched &&
          typeof shipmentObj.estimated_delivery_at === 'string' &&
          shipmentObj.estimated_delivery_at.trim()
            ? shipmentObj.estimated_delivery_at
            : undefined,
        items: subItems,
      };
    }
  );

  const fallbackOrderVendorId =
    typeof data.vendorId === 'string' && data.vendorId
      ? data.vendorId
      : typeof data.vendor_id === 'string' && data.vendor_id
        ? data.vendor_id
        : Array.from(vendorIdSet)[0] ?? '';
  const fallbackOrderVendorName =
    typeof data.vendorName === 'string' && data.vendorName
      ? data.vendorName
      : typeof data.vendor_name === 'string' && data.vendor_name
        ? data.vendor_name
        : Array.from(vendorNameSet)[0] ?? 'Verified Store';

  let items: AdminOrderItemDetail[] = orderItemsRaw.map((rawItem, idx) => {
    const mapped = mapAdminOrderItem(
      rawItem,
      idx,
      fallbackOrderVendorId,
      fallbackOrderVendorName
    );
    if (mapped.vendorId) vendorIdSet.add(mapped.vendorId);
    if (mapped.vendorName) vendorNameSet.add(mapped.vendorName);
    return mapped;
  });

  if (items.length === 0 && suborders.length > 0) {
    items = suborders.flatMap((sub) => sub.items);
  }

  if (typeof data.vendorId === 'string' && data.vendorId) {
    vendorIdSet.add(data.vendorId);
  }
  if (typeof data.vendorName === 'string' && data.vendorName) {
    vendorNameSet.add(data.vendorName);
  }

  const computedSellingSubtotal = items.reduce(
    (sum, it) => sum + it.lineTotal,
    0
  );
  const computedSubtotalMrp = items.reduce(
    (sum, it) => sum + it.unitMrp * it.quantity,
    0
  );
  const computedItemQuantity = items.reduce((sum, it) => sum + it.quantity, 0);

  const sellingSubtotal =
    Number(
      data.selling_subtotal ?? data.sellingSubtotal ?? computedSellingSubtotal
    ) || computedSellingSubtotal;
  const subtotalMrp =
    Number(data.subtotal_mrp ?? data.subtotalMrp ?? computedSubtotalMrp) ||
    Math.max(computedSubtotalMrp, sellingSubtotal);
  const productDiscount =
    Number(
      data.product_discount ??
        data.productDiscount ??
        Math.max(0, subtotalMrp - sellingSubtotal)
    ) || 0;
  const couponDiscount =
    Number(data.coupon_discount ?? data.couponDiscount ?? 0) || 0;
  const deliveryCharges =
    Number(
      data.delivery_charges ?? data.deliveryCharges ?? data.shipping_fee ?? 0
    ) || 0;

  const couponCodeRaw = data.coupon_code ?? data.couponCode;
  const couponCode =
    typeof couponCodeRaw === 'string' && couponCodeRaw.trim()
      ? couponCodeRaw.trim()
      : undefined;

  const amount = Number(
    data.total_amount ??
      data.totalAmount ??
      data.amount ??
      Math.max(0, sellingSubtotal - couponDiscount + deliveryCharges)
  );

  const isDefaultTemplateAddress =
    deliveryAddr.id === 'addr-home-1' || deliveryAddr.id === 'addr-work-2';

  const rawCustomerName = String(
    data.customerName ??
      data.customer_name ??
      deliveryAddr.fullName ??
      deliveryAddr.full_name ??
      'Customer'
  ).trim();
  const customerName = rawCustomerName || 'Customer';

  const topLevelPhone = sanitizeCustomerPhone(
    data.customerPhone ??
      data.customer_phone ??
      data.phone ??
      data.mobileNumber ??
      data.mobile_number
  );
  const addressPhone = sanitizeCustomerPhone(
    deliveryAddr.mobileNumber ??
      deliveryAddr.mobile_number ??
      deliveryAddr.phoneNumber ??
      deliveryAddr.phone_number ??
      deliveryAddr.phone,
    isDefaultTemplateAddress
  );
  const customerPhone = topLevelPhone || addressPhone;

  const paymentObj =
    typeof data.payment === 'object' && data.payment !== null
      ? (data.payment as Record<string, unknown>)
      : {};

  const houseAndStreet = [deliveryAddr.houseNumber, deliveryAddr.streetArea]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(', ');

  const resolvedAddressLine1 = String(
    deliveryAddr.addressLine1 ??
      deliveryAddr.address_line_1 ??
      deliveryAddr.street ??
      deliveryAddr.address ??
      houseAndStreet ??
      ''
  ).trim();

  const resolvedAddressLine2 = String(
    deliveryAddr.addressLine2 ??
      deliveryAddr.address_line_2 ??
      deliveryAddr.landmark ??
      ''
  ).trim();

  const deliveryAddress: AdminOrderAddressDetail = {
    label: String(deliveryAddr.label ?? 'Delivery Address'),
    fullName: String(
      deliveryAddr.fullName ?? deliveryAddr.full_name ?? customerName
    ),
    phoneNumber: customerPhone,
    addressLine1: resolvedAddressLine1,
    addressLine2: resolvedAddressLine2 || undefined,
    city: String(deliveryAddr.city ?? ''),
    state: String(deliveryAddr.state ?? ''),
    pincode: String(
      deliveryAddr.pincode ??
        deliveryAddr.postalCode ??
        deliveryAddr.zip ??
        ''
    ),
  };

  const historyRaw = Array.isArray(data.order_status_history)
    ? (data.order_status_history as Record<string, unknown>[])
    : [];

  const statusHistory: AdminOrderHistoryEntry[] = historyRaw.map((h, idx) => ({
    id: String(h.id ?? `hist_${idx + 1}`),
    suborderId:
      typeof h.suborder_id === 'string'
        ? h.suborder_id
        : typeof h.suborderId === 'string'
          ? h.suborderId
          : null,
    milestone: String(h.milestone ?? 'order_placed'),
    status: normalizeStatus(h.status),
    title: String(h.title ?? 'Order Update'),
    description: String(h.description ?? ''),
    createdAt: parseFirestoreDate(h.created_at ?? h.createdAt),
  }));

  const transactionIdRaw =
    paymentObj.transaction_id ??
    paymentObj.transactionId ??
    data.transaction_id ??
    data.transactionId;

  return {
    id,
    orderNumber,
    userId: String(
      data.user_id ?? data.userId ?? data.customerUid ?? ''
    ).trim(),
    customerName,
    customerEmail: String(data.customerEmail ?? data.user_email ?? ''),
    customerPhone,
    amount: Number.isFinite(amount) ? amount : 0,
    subtotalMrp,
    sellingSubtotal,
    productDiscount,
    couponCode,
    couponDiscount,
    deliveryCharges,
    status: parentStage.status,
    currentMilestone: parentStage.milestone,
    createdAt: parseFirestoreDate(data.created_at ?? data.createdAt),
    vendorIds: Array.from(vendorIdSet),
    vendorNames: Array.from(vendorNameSet),
    itemCount:
      Number(
        data.total_quantity ??
          data.itemCount ??
          computedItemQuantity ??
          items.length
      ) || 1,
    paymentMethod: String(
      paymentObj.payment_method_label ??
        paymentObj.payment_method ??
        data.paymentMethod ??
        'UPI'
    ),
    paymentStatus: String(
      paymentObj.payment_status ??
        paymentObj.status ??
        data.paymentStatus ??
        'paid'
    ),
    transactionId:
      typeof transactionIdRaw === 'string' && transactionIdRaw.trim()
        ? transactionIdRaw.trim()
        : undefined,
    deliveryAddress,
    items,
    suborders,
    statusHistory,
  };
}

const adminCustomerProfileCache = new Map<
  string,
  { phone: string; fullName: string; email: string }
>();

export function subscribeOrders(
  onData: (orders: AdminOrderSummary[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.orders);
  return onSnapshot(
    colRef,
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const mapped = mapOrderDoc(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (!mapped.customerPhone && mapped.userId) {
            const cached = adminCustomerProfileCache.get(mapped.userId);
            if (cached?.phone) {
              mapped.customerPhone = cached.phone;
              mapped.deliveryAddress.phoneNumber = cached.phone;
            }
            if (
              cached?.fullName &&
              (mapped.customerName === 'Aarav Sharma' ||
                mapped.customerName === 'Customer')
            ) {
              mapped.customerName = cached.fullName;
              mapped.deliveryAddress.fullName = cached.fullName;
            }
            if (cached?.email && !mapped.customerEmail) {
              mapped.customerEmail = cached.email;
            }
          }
          return mapped;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      onData(list);

      const missingPhoneUids = Array.from(
        new Set(
          list
            .filter((o) => !o.customerPhone && Boolean(o.userId))
            .map((o) => String(o.userId ?? '').trim())
            .filter((uid) => uid.length > 0 && !adminCustomerProfileCache.has(uid))
        )
      );

      if (missingPhoneUids.length > 0 && firestoreDb) {
        const db = firestoreDb;
        void Promise.all(
          missingPhoneUids.map(async (uid) => {
            try {
              const userSnap = await getDoc(
                doc(db, ZEMIGO_COLLECTIONS.users, uid)
              );
              if (userSnap.exists()) {
                const rawUser = userSnap.data() as Record<string, unknown>;
                const phone = extractCustomerPhoneFromProfile(rawUser);
                const fullName = String(
                  rawUser.fullName ??
                    rawUser.full_name ??
                    rawUser.name ??
                    rawUser.displayName ??
                    ''
                ).trim();
                const email = String(rawUser.email ?? '').trim();
                adminCustomerProfileCache.set(uid, { phone, fullName, email });
              } else {
                adminCustomerProfileCache.set(uid, {
                  phone: '',
                  fullName: '',
                  email: '',
                });
              }
            } catch {
              // Ignore profile lookup errors
            }
          })
        ).then(() => {
          let updatedAny = false;
          const nextList = list.map((ord) => {
            if (ord.customerPhone || !ord.userId) return ord;
            const cached = adminCustomerProfileCache.get(ord.userId);
            if (!cached?.phone) return ord;
            updatedAny = true;
            const resolvedName =
              cached.fullName &&
              (ord.customerName === 'Aarav Sharma' ||
                ord.customerName === 'Customer')
                ? cached.fullName
                : ord.customerName;

            return {
              ...ord,
              customerPhone: cached.phone,
              customerName: resolvedName,
              customerEmail: ord.customerEmail || cached.email,
              deliveryAddress: {
                ...ord.deliveryAddress,
                phoneNumber: cached.phone,
                fullName: resolvedName,
              },
            };
          });

          if (updatedAny) {
            onData(nextList);
          }
        });
      }
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );
}

export function subscribeVendors(
  onData: (vendors: AdminVendorRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  let vendorColDocs = new Map<string, AdminVendorRecord>();
  let userVendorDocs = new Map<string, AdminVendorRecord>();

  const emitMerged = () => {
    const merged = new Map<string, AdminVendorRecord>(userVendorDocs);
    for (const [id, rec] of vendorColDocs.entries()) {
      merged.set(id, rec);
    }
    const list = Array.from(merged.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    onData(list);
  };

  const vendorsRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.vendors);
  const unsubVendors = onSnapshot(
    vendorsRef,
    (snap) => {
      const nextMap = new Map<string, AdminVendorRecord>();
      for (const d of snap.docs) {
        const raw = d.data() as Record<string, unknown>;
        const verifiedFlag = Boolean(raw.verified ?? false);
        const approvalStatus = parseApprovalStatus(
          raw.approvalStatus,
          verifiedFlag
        );
        const activeFlag =
          typeof raw.active === 'boolean'
            ? raw.active
            : approvalStatus === 'approved';

        nextMap.set(d.id, {
          id: d.id,
          storeName: String(
            raw.storeName ?? raw.store_name ?? raw.name ?? 'Vendor Store'
          ),
          email: typeof raw.email === 'string' ? raw.email : undefined,
          phone: typeof raw.phone === 'string' ? raw.phone : undefined,
          categoryLabel: String(
            raw.categoryLabel ??
              raw.category ??
              raw.primaryCategory ??
              'General Store'
          ),
          city: String(raw.city ?? 'India'),
          rating: Number(raw.rating ?? 4.5),
          verified: verifiedFlag,
          active: activeFlag,
          approvalStatus,
          rejectionReason:
            typeof raw.rejectionReason === 'string'
              ? raw.rejectionReason
              : undefined,
          logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : undefined,
          commissionRate:
            raw.commissionRate !== undefined && raw.commissionRate !== null
              ? Number(raw.commissionRate)
              : undefined,
          totalOrders: Number(raw.totalOrders ?? raw.ordersCount ?? 0),
          totalSales: Number(raw.totalSales ?? raw.salesAmount ?? 0),
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
        });
      }
      vendorColDocs = nextMap;
      emitMerged();
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );

  const usersRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.users);
  const unsubUsers = onSnapshot(
    usersRef,
    (snap) => {
      const nextUserVendors = new Map<string, AdminVendorRecord>();
      for (const d of snap.docs) {
        const raw = d.data() as Record<string, unknown>;
        if (String(raw.role ?? '').toLowerCase() !== 'vendor') continue;

        const verifiedFlag = Boolean(raw.verified ?? false);
        const approvalStatus = parseApprovalStatus(
          raw.approvalStatus,
          verifiedFlag
        );
        const activeFlag =
          typeof raw.active === 'boolean'
            ? raw.active
            : approvalStatus === 'approved';

        nextUserVendors.set(d.id, {
          id: d.id,
          storeName: String(
            raw.storeName ??
              raw.fullName ??
              raw.name ??
              raw.displayName ??
              'Vendor Store'
          ),
          email: typeof raw.email === 'string' ? raw.email : undefined,
          phone:
            typeof raw.phone === 'string'
              ? raw.phone
              : typeof raw.mobileNumber === 'string'
                ? raw.mobileNumber
                : undefined,
          categoryLabel: String(
            raw.categoryLabel ?? raw.category ?? 'Multi-Category Store'
          ),
          city: String(raw.city ?? 'India'),
          rating: Number(raw.rating ?? 4.5),
          verified: verifiedFlag,
          active: activeFlag,
          approvalStatus,
          commissionRate:
            raw.commissionRate !== undefined && raw.commissionRate !== null
              ? Number(raw.commissionRate)
              : undefined,
          totalOrders: 0,
          totalSales: 0,
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
        });
      }
      userVendorDocs = nextUserVendors;
      emitMerged();
    },
    () => {
      // Ignore secondary users listener error if vendors listener handles it
    }
  );

  return () => {
    unsubVendors();
    unsubUsers();
  };
}

export function subscribeCustomers(
  onData: (customers: AdminCustomerRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.users);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminCustomerRecord[] = [];
      for (const d of snap.docs) {
        const raw = d.data() as Record<string, unknown>;
        const role = String(raw.role ?? 'customer').toLowerCase();
        if (role === 'admin' || role === 'vendor') continue;

        list.push({
          id: d.id,
          fullName: String(
            raw.fullName ?? raw.full_name ?? raw.displayName ?? 'Customer'
          ),
          email: String(raw.email ?? ''),
          mobileNumber: String(raw.mobileNumber ?? raw.phone ?? ''),
          city: String(raw.city ?? ''),
          ordersCount: Number(raw.ordersCount ?? 0),
          totalSpent: Number(raw.totalSpent ?? 0),
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
        });
      }
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );
}

export function subscribeProducts(
  onData: (products: AdminProductRecord[]) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.products);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminProductRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const approvalStatus = parseApprovalStatus(
          raw.approvalStatus,
          false
        );
        return {
          id: d.id,
          name: String(raw.name ?? 'Product'),
          brand: String(raw.brand ?? ''),
          categoryId: String(raw.categoryId ?? raw.category_id ?? ''),
          categoryName: String(raw.categoryName ?? raw.category ?? 'General'),
          vendorId: String(raw.vendor_id ?? raw.vendorId ?? ''),
          vendorName: String(raw.vendorName ?? raw.vendor_name ?? 'Vendor'),
          price: Number(raw.price ?? raw.selling_price ?? 0),
          originalPrice: Number(raw.originalPrice ?? raw.mrp ?? raw.price ?? 0),
          stockQuantity: Number(raw.stockQuantity ?? raw.stockCount ?? raw.stock ?? 0),
          inStock: Boolean(raw.inStock ?? true),
          approvalStatus,
          rejectionReason:
            typeof raw.rejectionReason === 'string'
              ? raw.rejectionReason
              : undefined,
          rating: Number(raw.rating ?? 4.5),
          imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
        };
      });
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    () => onData([])
  );
}

export function subscribeCategories(
  onData: (categories: AdminCategoryRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.categories);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminCategoryRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const imageUrlRaw =
          typeof raw.imageUrl === 'string' && raw.imageUrl.trim()
            ? raw.imageUrl.trim()
            : undefined;
        const iconUrlRaw =
          typeof raw.iconUrl === 'string' && raw.iconUrl.trim()
            ? raw.iconUrl.trim()
            : undefined;
        const resolvedImg = imageUrlRaw ?? iconUrlRaw;
        return {
          id: d.id,
          name: String(raw.name ?? 'Category'),
          slug: String(raw.slug ?? d.id),
          description:
            typeof raw.description === 'string' && raw.description.trim()
              ? raw.description.trim()
              : undefined,
          icon:
            typeof raw.icon === 'string' && raw.icon.trim()
              ? raw.icon.trim()
              : undefined,
          imageUrl: resolvedImg,
          iconUrl: iconUrlRaw ?? resolvedImg,
          displayOrder:
            raw.displayOrder !== undefined && raw.displayOrder !== null
              ? Number(raw.displayOrder)
              : 999,
          productCount: Number(raw.productCount ?? 0),
          active: raw.active !== false,
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
          updatedAt: raw.updatedAt
            ? parseFirestoreDate(raw.updatedAt)
            : undefined,
        };
      });
      list.sort(
        (a, b) =>
          a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
      );
      onData(list);
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );
}

export function subscribeBanners(
  onData: (banners: AdminBannerRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.banners);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminBannerRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const targetCategoryId =
          typeof raw.targetCategoryId === 'string' && raw.targetCategoryId.trim()
            ? raw.targetCategoryId.trim()
            : undefined;
        const targetProductId =
          typeof raw.targetProductId === 'string' && raw.targetProductId.trim()
            ? raw.targetProductId.trim()
            : undefined;
        const navigationTarget =
          typeof raw.navigationTarget === 'string' && raw.navigationTarget.trim()
            ? raw.navigationTarget.trim()
            : undefined;

        const inferredTargetType =
          raw.targetType === 'category' ||
          raw.targetType === 'product' ||
          raw.targetType === 'link' ||
          raw.targetType === 'none'
            ? raw.targetType
            : targetProductId
              ? 'product'
              : targetCategoryId
                ? 'category'
                : navigationTarget
                  ? 'link'
                  : 'none';

        const discountPrefix =
          typeof raw.discountPrefix === 'string' ? raw.discountPrefix : undefined;
        const discountHighlight =
          typeof raw.discountHighlight === 'string'
            ? raw.discountHighlight
            : undefined;
        const discountText = String(
          raw.discountText ??
            (`${discountPrefix ?? ''}${discountHighlight ?? ''}`.trim() || '')
        );

        return {
          id: d.id,
          title: String(raw.title ?? raw.badgeText ?? 'Promo Banner'),
          subtitle: String(raw.subtitle ?? ''),
          discountText,
          discountPrefix,
          discountHighlight,
          buttonText: String(raw.buttonText ?? raw.ctaText ?? 'Shop Now'),
          targetType: inferredTargetType,
          targetCategoryId,
          targetCategoryName:
            typeof raw.targetCategoryName === 'string'
              ? raw.targetCategoryName
              : undefined,
          targetProductId,
          targetProductName:
            typeof raw.targetProductName === 'string'
              ? raw.targetProductName
              : undefined,
          navigationTarget,
          imageUrl:
            typeof raw.imageUrl === 'string' && raw.imageUrl.trim()
              ? raw.imageUrl.trim()
              : undefined,
          imageWidth:
            raw.imageWidth !== undefined && raw.imageWidth !== null
              ? Number(raw.imageWidth)
              : undefined,
          imageHeight:
            raw.imageHeight !== undefined && raw.imageHeight !== null
              ? Number(raw.imageHeight)
              : undefined,
          displayOrder:
            raw.displayOrder !== undefined && raw.displayOrder !== null
              ? Number(raw.displayOrder)
              : 999,
          active: raw.active !== false,
          startDate:
            typeof raw.startDate === 'string' && raw.startDate.trim()
              ? raw.startDate.trim()
              : undefined,
          endDate:
            typeof raw.endDate === 'string' && raw.endDate.trim()
              ? raw.endDate.trim()
              : undefined,
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
          updatedAt: raw.updatedAt
            ? parseFirestoreDate(raw.updatedAt)
            : undefined,
        };
      });
      list.sort(
        (a, b) =>
          a.displayOrder - b.displayOrder ||
          b.createdAt.getTime() - a.createdAt.getTime()
      );
      onData(list);
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );
}

export function subscribeCoupons(
  onData: (coupons: AdminCouponRecord[]) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.coupons);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminCouponRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          code: String(raw.code ?? d.id).toUpperCase(),
          title: String(raw.title ?? ''),
          discountType:
            raw.discountType === 'percentage' ? 'percentage' : 'flat',
          discountValue: Number(raw.discountValue ?? 0),
          minOrderValue: Number(raw.minOrderValue ?? 0),
          maxDiscount:
            raw.maxDiscount !== undefined ? Number(raw.maxDiscount) : undefined,
          active: Boolean(raw.active ?? true),
        };
      });
      onData(list);
    },
    () => onData([])
  );
}

export function subscribePayouts(
  onData: (payouts: AdminPayoutRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }

  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.payouts);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminPayoutRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const st = String(raw.status ?? 'pending').toLowerCase();
        const paidAtDate = parseFirestoreDate(raw.paidAt);
        const createdAtDate = parseFirestoreDate(
          raw.createdAt ?? raw.created_at ?? raw.paidAt
        );
        return {
          id: d.id,
          vendorId: String(raw.vendorId ?? ''),
          vendorName: String(raw.vendorName ?? 'Vendor'),
          grossAmount: Number(raw.grossAmount ?? 0),
          commissionAmount: Number(raw.commissionAmount ?? 0),
          commissionRate:
            raw.commissionRate !== undefined
              ? Number(raw.commissionRate)
              : undefined,
          netPayout: Number(raw.netPayout ?? raw.amount ?? 0),
          status:
            st === 'paid' || st === 'settled'
              ? 'paid'
              : st === 'processing'
                ? 'processing'
                : 'pending',
          paymentMethod:
            typeof raw.paymentMethod === 'string'
              ? raw.paymentMethod
              : undefined,
          referenceId:
            typeof raw.referenceId === 'string' ? raw.referenceId : undefined,
          payoutDate:
            typeof raw.payoutDate === 'string' ? raw.payoutDate : undefined,
          notes: typeof raw.notes === 'string' ? raw.notes : undefined,
          recordedBy:
            typeof raw.recordedBy === 'string' ? raw.recordedBy : undefined,
          paidAt: paidAtDate.getTime() > 0 ? paidAtDate : undefined,
          createdAt: createdAtDate,
        };
      });
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    (err) => {
      onError?.(err);
      onData([]);
    }
  );
}

export function subscribeMarketplaceSettings(
  onData: (settings: MarketplaceSettings) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestoreDb) {
    onData({
      defaultCommissionPercent: 10,
      freeDeliveryThreshold: 499,
      supportEmail: 'support@zemigo.in',
    });
    return () => {};
  }

  const ref = doc(firestoreDb, ZEMIGO_COLLECTIONS.settings, 'marketplace');
  return onSnapshot(
    ref,
    (snap) => {
      const raw = (snap.exists() ? snap.data() : {}) as Record<
        string,
        unknown
      >;
      onData({
        defaultCommissionPercent: Number(raw.defaultCommissionPercent ?? 10),
        freeDeliveryThreshold: Number(raw.freeDeliveryThreshold ?? 499),
        supportEmail: String(raw.supportEmail ?? 'support@zemigo.in'),
        updatedAt: raw.updatedAt
          ? parseFirestoreDate(raw.updatedAt)
          : undefined,
      });
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function updateVendorCommissionRateInFirestore(
  vendorId: string,
  commissionRate: number
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanRate = Math.max(0, Math.min(50, Number(commissionRate)));
  if (!Number.isFinite(cleanRate)) {
    throw new Error('Please enter a valid commission rate between 0% and 50%.');
  }
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.vendors, vendorId),
    {
      commissionRate: cleanRate,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface RecordVendorPayoutInput {
  vendorId: string;
  vendorName: string;
  amount: number;
  grossDeliveredSales: number;
  commissionAmount: number;
  commissionRate: number;
  eligibleNetEarnings: number;
  alreadyPaidAmount: number;
  payoutDate: string; // YYYY-MM-DD
  paymentMethod: PayoutPaymentMethod;
  referenceId: string;
  notes?: string;
  adminUid?: string | null;
}

/**
 * Atomically records a settled vendor payout in `payouts` and updates `vendors/{vendorId}` balances
 * using a Firestore transaction. Prevents duplicate transaction references and overpayments.
 */
export async function recordVendorPayoutInFirestore(
  input: RecordVendorPayoutInput
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }

  const cleanVendorId = input.vendorId.trim();
  const cleanRef = input.referenceId.trim();
  const cleanAmount = Math.round(Number(input.amount) * 100) / 100;

  if (!cleanVendorId) {
    throw new Error('Please select a vendor for payout.');
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Payout amount must be greater than ₹0.');
  }
  if (!cleanRef || cleanRef.length < 3) {
    throw new Error(
      'Please enter a valid unique transaction reference / UTR number.'
    );
  }
  if (!input.payoutDate) {
    throw new Error('Please select a valid payout date.');
  }

  const cleanRefKey = cleanRef.toLowerCase();
  // Check for existing duplicate transaction reference (exact & case-insensitive key)
  const [existingByRef, existingByKey] = await Promise.all([
    getDocs(
      query(
        collection(firestoreDb, ZEMIGO_COLLECTIONS.payouts),
        where('referenceId', '==', cleanRef)
      )
    ),
    getDocs(
      query(
        collection(firestoreDb, ZEMIGO_COLLECTIONS.payouts),
        where('referenceKey', '==', cleanRefKey)
      )
    ),
  ]);
  if (!existingByRef.empty || !existingByKey.empty) {
    throw new Error(
      `Duplicate payout blocked: Transaction reference "${cleanRef}" has already been recorded.`
    );
  }

  const normalizedRefKey = cleanRefKey.replace(/[^a-z0-9_-]/g, '_');
  const payoutDocId = `pay_${cleanVendorId}_${normalizedRefKey}`;
  const payoutRef = doc(firestoreDb, ZEMIGO_COLLECTIONS.payouts, payoutDocId);
  const vendorRef = doc(firestoreDb, ZEMIGO_COLLECTIONS.vendors, cleanVendorId);

  const parsedPayoutDate = new Date(`${input.payoutDate}T12:00:00`);
  const effectivePaidAt = Number.isNaN(parsedPayoutDate.getTime())
    ? new Date()
    : parsedPayoutDate;

  await runTransaction(firestoreDb, async (tx) => {
    const existingPayoutSnap = await tx.get(payoutRef);
    if (existingPayoutSnap.exists()) {
      throw new Error(
        `Duplicate payout blocked: Transaction reference "${cleanRef}" already exists.`
      );
    }

    const vendorSnap = await tx.get(vendorRef);
    const vendorData = vendorSnap.exists()
      ? (vendorSnap.data() as Record<string, unknown>)
      : {};
    const storedPaid = Number(vendorData.totalPayoutsPaid ?? 0) || 0;
    const baselinePaid = Math.max(input.alreadyPaidAmount, storedPaid);
    const remainingAllowed = Math.max(
      0,
      input.eligibleNetEarnings - baselinePaid
    );

    if (cleanAmount > remainingAllowed + 0.01) {
      throw new Error(
        `Payout amount (₹${cleanAmount.toLocaleString('en-IN')}) exceeds the vendor's remaining eligible balance (₹${Math.round(remainingAllowed).toLocaleString('en-IN')}).`
      );
    }

    const nextTotalPaid = baselinePaid + cleanAmount;
    const nextPendingBalance = Math.max(
      0,
      input.eligibleNetEarnings - nextTotalPaid
    );

    const proportionalRatio =
      input.eligibleNetEarnings > 0
        ? Math.min(1, cleanAmount / input.eligibleNetEarnings)
        : 1;
    const grossShare = Math.round(input.grossDeliveredSales * proportionalRatio);
    const commissionShare = Math.round(
      input.commissionAmount * proportionalRatio
    );

    tx.set(payoutRef, {
      vendorId: cleanVendorId,
      vendorName: input.vendorName.trim() || 'Vendor',
      grossAmount: grossShare,
      commissionAmount: commissionShare,
      commissionRate: input.commissionRate,
      netPayout: cleanAmount,
      amount: cleanAmount,
      status: 'paid',
      paymentMethod: input.paymentMethod,
      referenceId: cleanRef,
      referenceKey: cleanRefKey,
      payoutDate: input.payoutDate,
      notes: input.notes?.trim() || null,
      recordedBy: input.adminUid ?? null,
      paidAt: Timestamp.fromDate(effectivePaidAt),
      createdAt: serverTimestamp(),
      created_at: effectivePaidAt.toISOString(),
    });

    tx.set(
      vendorRef,
      {
        totalPayoutsPaid: nextTotalPaid,
        pendingPayoutBalance: nextPendingBalance,
        lastPayoutAmount: cleanAmount,
        lastPayoutReference: cleanRef,
        lastPayoutAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Updates an order's status in Firestore using canonical statuses across
 * Customer App, Admin Panel, and Vendor Panel (`placed` -> `confirmed` ->
 * `processing` -> `shipped` -> `out_for_delivery` -> `delivered` / `cancelled`).
 * Shipment carrier & tracking IDs are created ONLY upon actual shipment confirmation (`shipped`+).
 */
export async function updateOrderStatusInFirestore(
  orderId: string,
  nextStatus: OrderOverallStatus
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const ref = doc(firestoreDb, ZEMIGO_COLLECTIONS.orders, orderId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const estDeliveryIso = new Date(
    nowMs + 4 * 24 * 60 * 60 * 1000
  ).toISOString();

  const targetStepIdx = ORDER_STAGE_STEPS.findIndex(
    (s) => s.status === nextStatus
  );
  const nextMilestone =
    nextStatus === 'cancelled'
      ? 'cancelled'
      : mapStatusToCanonicalMilestone(nextStatus);
  const shippedStageReached = isDispatchedStage(nextStatus);

  const snap = await getDoc(ref).catch(() => null);
  if (snap && snap.exists()) {
    const raw = snap.data() as Record<string, unknown>;
    const suborders = Array.isArray(raw.vendor_suborders)
      ? (raw.vendor_suborders as Record<string, unknown>[])
      : [];
    const shipments = Array.isArray(raw.shipments)
      ? (raw.shipments as Record<string, unknown>[])
      : [];
    const history = Array.isArray(raw.order_status_history)
      ? (raw.order_status_history as Record<string, unknown>[])
      : [];

    const currentStage = reconcileAdminOrderStage(
      raw.overall_status ?? raw.status,
      raw.current_milestone,
      history
    );
    const currentStepIdx = ORDER_STAGE_STEPS.findIndex(
      (s) => s.milestone === currentStage.milestone
    );

    const buildUpdatedShipmentObj = (
      existingShip: Record<string, unknown> | undefined
    ): Record<string, unknown> => {
      const base = existingShip ?? {};
      if (nextStatus === 'cancelled') {
        return {
          ...base,
          status: 'cancelled',
        };
      }
      if (!shippedStageReached) {
        return {
          ...base,
          status: nextStatus,
          current_milestone: nextMilestone,
          carrier_name: null,
          tracking_number: null,
          estimated_delivery_at: null,
          shipped_at: null,
          delivered_at: null,
        };
      }
      const existingCarrier =
        typeof base.carrier_name === 'string' && base.carrier_name.trim()
          ? base.carrier_name.trim()
          : 'ZemiGo Express';
      const existingTracking =
        typeof base.tracking_number === 'string' && base.tracking_number.trim()
          ? base.tracking_number.trim()
          : `ZMGX${Math.floor(10000000 + Math.random() * 90000000)}`;
      const existingEta =
        typeof base.estimated_delivery_at === 'string' &&
        base.estimated_delivery_at.trim()
          ? base.estimated_delivery_at
          : estDeliveryIso;
      return {
        ...base,
        status: nextStatus,
        current_milestone: nextMilestone,
        carrier_name: existingCarrier,
        tracking_number: existingTracking,
        estimated_delivery_at: existingEta,
        shipped_at:
          typeof base.shipped_at === 'string' && base.shipped_at
            ? base.shipped_at
            : nowIso,
        delivered_at:
          nextStatus === 'delivered'
            ? typeof base.delivered_at === 'string' && base.delivered_at
              ? base.delivered_at
              : nowIso
            : null,
      };
    };

    const updatedSuborders = suborders.map((sub) => {
      const subShipment =
        typeof sub.shipment === 'object' && sub.shipment !== null
          ? buildUpdatedShipmentObj(sub.shipment as Record<string, unknown>)
          : sub.shipment;
      return {
        ...sub,
        status: nextStatus,
        current_milestone:
          nextStatus === 'cancelled'
            ? sub.current_milestone ?? 'order_placed'
            : nextMilestone,
        shipment: subShipment,
      };
    });

    const updatedShipments =
      updatedSuborders.length > 0
        ? updatedSuborders
            .map((s) => s.shipment)
            .filter((s): s is Record<string, unknown> => Boolean(s))
        : shipments.map((ship) => buildUpdatedShipmentObj(ship));

    const addedHistory: Record<string, unknown>[] = [];
    if (nextStatus === 'cancelled') {
      addedHistory.push({
        id: `hist_admin_${nowMs}`,
        order_id: orderId,
        suborder_id: null,
        milestone: 'cancelled',
        status: 'cancelled',
        title: 'Order Cancelled',
        description: 'Order status updated to CANCELLED by ZemiGo Admin.',
        created_at: nowIso,
      });
    } else if (targetStepIdx > currentStepIdx) {
      for (let i = Math.max(1, currentStepIdx + 1); i <= targetStepIdx; i++) {
        const stepDef = ORDER_STAGE_STEPS[i];
        const stepIso = new Date(
          nowMs + (i - Math.max(0, currentStepIdx)) * 1000
        ).toISOString();
        addedHistory.push({
          id: `hist_admin_${nowMs}_${i}`,
          order_id: orderId,
          suborder_id: null,
          milestone: stepDef.milestone,
          status: stepDef.status,
          title: stepDef.title,
          description: `${stepDef.description} (Updated by ZemiGo Admin).`,
          created_at: stepIso,
        });
      }
    } else if (targetStepIdx >= 0) {
      const stepDef = ORDER_STAGE_STEPS[targetStepIdx];
      addedHistory.push({
        id: `hist_admin_${nowMs}`,
        order_id: orderId,
        suborder_id: null,
        milestone: stepDef.milestone,
        status: stepDef.status,
        title: stepDef.title,
        description: `Order status set to ${stepDef.title} by ZemiGo Admin.`,
        created_at: nowIso,
      });
    }

    await updateDoc(ref, {
      overall_status: nextStatus,
      status: nextStatus,
      current_milestone:
        nextStatus === 'cancelled'
          ? currentStage.milestone
          : nextMilestone,
      ...(updatedSuborders.length > 0
        ? { vendor_suborders: updatedSuborders }
        : {}),
      ...(updatedShipments.length > 0 ? { shipments: updatedShipments } : {}),
      order_status_history: [...history, ...addedHistory],
      updated_at: nowIso,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    overall_status: nextStatus,
    status: nextStatus,
    current_milestone: nextMilestone,
    updated_at: nowIso,
    updatedAt: serverTimestamp(),
  });
}

export async function createVendorInFirestore(input: {
  storeName: string;
  categoryLabel: string;
  city: string;
  commissionRate: number;
  logoUrl?: string;
}): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await addDoc(collection(firestoreDb, ZEMIGO_COLLECTIONS.vendors), {
    storeName: input.storeName.trim(),
    store_name: input.storeName.trim(),
    name: input.storeName.trim(),
    categoryLabel: input.categoryLabel.trim(),
    category: input.categoryLabel.trim(),
    city: input.city.trim(),
    commissionRate: input.commissionRate,
    logoUrl: input.logoUrl ?? null,
    rating: 4.8,
    reviewCount: 0,
    approvalStatus: 'approved',
    verified: true,
    active: true,
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    created_at: new Date().toISOString(),
  });
}

export async function approveVendorInFirestore(
  vendorId: string,
  adminUid?: string | null
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.vendors, vendorId),
    {
      ownerUid: vendorId,
      approvalStatus: 'approved',
      verified: true,
      active: true,
      rejectionReason: null,
      approvedAt: serverTimestamp(),
      approvedBy: adminUid ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.users, vendorId),
    {
      approvalStatus: 'approved',
      verified: true,
      status: 'active',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  ).catch(() => {
    // Vendor may have been created manually by Admin without a matching users/{vendorId} doc
  });
}

export async function rejectVendorInFirestore(
  vendorId: string,
  reason = 'Does not meet marketplace verification requirements',
  adminUid?: string | null
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.vendors, vendorId),
    {
      ownerUid: vendorId,
      approvalStatus: 'rejected',
      verified: false,
      active: false,
      rejectionReason: reason.trim(),
      approvedBy: adminUid ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.users, vendorId),
    {
      approvalStatus: 'rejected',
      verified: false,
      status: 'rejected',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  ).catch(() => {});
}

export async function toggleVendorActiveInFirestore(
  vendorId: string,
  active: boolean
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.vendors, vendorId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function createProductInFirestore(input: {
  name: string;
  brand: string;
  categoryName: string;
  vendorName: string;
  price: number;
  originalPrice: number;
  imageUrl?: string;
}): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const discountPercentage =
    input.originalPrice > input.price
      ? Math.round(
          ((input.originalPrice - input.price) / input.originalPrice) * 100
        )
      : 0;

  await addDoc(collection(firestoreDb, ZEMIGO_COLLECTIONS.products), {
    name: input.name.trim(),
    brand: input.brand.trim(),
    categoryName: input.categoryName.trim(),
    category: input.categoryName.trim(),
    vendorName: input.vendorName.trim(),
    vendor_name: input.vendorName.trim(),
    price: input.price,
    selling_price: input.price,
    originalPrice: input.originalPrice,
    mrp: input.originalPrice,
    discountPercentage,
    imageUrl: input.imageUrl ?? null,
    stockQuantity: 25,
    inStock: true,
    approvalStatus: 'approved',
    approvedAt: serverTimestamp(),
    rating: 4.5,
    reviewCount: 0,
    createdAt: serverTimestamp(),
    created_at: new Date().toISOString(),
  });
}

export async function approveProductInFirestore(
  productId: string,
  adminUid?: string | null
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.products, productId), {
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: serverTimestamp(),
    approvedBy: adminUid ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function rejectProductInFirestore(
  productId: string,
  reason = 'Product listing requires revision',
  adminUid?: string | null
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.products, productId), {
    approvalStatus: 'rejected',
    rejectionReason: reason.trim(),
    approvedBy: adminUid ?? null,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeCommissions(
  onData: (commissions: AdminCommissionRecord[]) => void
): () => void {
  if (!firestoreDb) {
    onData([]);
    return () => {};
  }
  const colRef = collection(firestoreDb, ZEMIGO_COLLECTIONS.commissions);
  return onSnapshot(
    colRef,
    (snap) => {
      const list: AdminCommissionRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          orderId: String(raw.orderId ?? raw.order_id ?? ''),
          vendorId: String(raw.vendorId ?? raw.vendor_id ?? ''),
          vendorName: String(raw.vendorName ?? raw.vendor_name ?? 'Vendor'),
          grossAmount: Number(raw.grossAmount ?? 0),
          commissionRate: Number(raw.commissionRate ?? 10),
          commissionAmount: Number(raw.commissionAmount ?? 0),
          createdAt: parseFirestoreDate(raw.createdAt ?? raw.created_at),
        };
      });
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(list);
    },
    () => onData([])
  );
}

export function buildCategorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateCategoryImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const isValid =
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/');
  if (!isValid) {
    throw new Error('Invalid category image URL returned from storage.');
  }
  return trimmed;
}

export async function createCategoryInFirestore(input: {
  name: string;
  description?: string;
  icon?: string;
  imageUrl?: string | null;
  displayOrder?: number;
  active?: boolean;
}): Promise<string> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Category name is required.');
  }
  const slug = buildCategorySlug(cleanName) || `cat-${Date.now()}`;
  const validatedImg = validateCategoryImageUrl(input.imageUrl);
  const displayOrder =
    typeof input.displayOrder === 'number' &&
    Number.isFinite(input.displayOrder) &&
    input.displayOrder >= 0
      ? Math.round(input.displayOrder)
      : 99;

  // Prevent duplicate categories by name or slug
  const existingSnap = await getDocs(
    collection(firestoreDb, ZEMIGO_COLLECTIONS.categories)
  );
  for (const d of existingSnap.docs) {
    const raw = d.data() as Record<string, unknown>;
    const existingName = String(raw.name ?? '').trim().toLowerCase();
    const existingSlug = String(raw.slug ?? d.id).trim().toLowerCase();
    if (existingName === cleanName.toLowerCase() || existingSlug === slug) {
      throw new Error(
        `A category named "${String(raw.name ?? cleanName)}" already exists.`
      );
    }
  }

  const created = await addDoc(
    collection(firestoreDb, ZEMIGO_COLLECTIONS.categories),
    {
      name: cleanName,
      slug,
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      imageUrl: validatedImg,
      iconUrl: validatedImg,
      displayOrder,
      productCount: 0,
      active: input.active !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return created.id;
}

export async function updateCategoryInFirestore(
  categoryId: string,
  input: {
    name: string;
    description?: string;
    icon?: string;
    imageUrl?: string | null;
    displayOrder?: number;
    active?: boolean;
  }
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Category name is required.');
  }
  const slug = buildCategorySlug(cleanName) || categoryId;
  const validatedImg = validateCategoryImageUrl(input.imageUrl);
  const displayOrder =
    typeof input.displayOrder === 'number' &&
    Number.isFinite(input.displayOrder) &&
    input.displayOrder >= 0
      ? Math.round(input.displayOrder)
      : 99;

  const existingSnap = await getDocs(
    collection(firestoreDb, ZEMIGO_COLLECTIONS.categories)
  );
  for (const d of existingSnap.docs) {
    if (d.id === categoryId) continue;
    const raw = d.data() as Record<string, unknown>;
    const existingName = String(raw.name ?? '').trim().toLowerCase();
    const existingSlug = String(raw.slug ?? d.id).trim().toLowerCase();
    if (existingName === cleanName.toLowerCase() || existingSlug === slug) {
      throw new Error(
        `Another category named "${String(raw.name ?? cleanName)}" already exists.`
      );
    }
  }

  const payload: Record<string, unknown> = {
    name: cleanName,
    slug,
    description: input.description?.trim() || null,
    icon: input.icon?.trim() || null,
    displayOrder,
    active: input.active !== false,
    updatedAt: serverTimestamp(),
  };

  if (input.imageUrl !== undefined) {
    payload.imageUrl = validatedImg;
    payload.iconUrl = validatedImg;
  }

  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.categories, categoryId),
    payload,
    { merge: true }
  );
}

export async function toggleCategoryActiveInFirestore(
  categoryId: string,
  active: boolean
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.categories, categoryId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export interface LinkedCategoryProductInfo {
  id: string;
  name: string;
  approvalStatus: string;
}

export function doesProductMatchCategory(
  product: {
    categoryId?: string;
    categoryName?: string;
  },
  category: Pick<AdminCategoryRecord, 'id' | 'name' | 'slug'>
): boolean {
  const pCatId = String(product.categoryId ?? '').trim().toLowerCase();
  const pCatName = String(product.categoryName ?? '').trim().toLowerCase();
  const cId = category.id.trim().toLowerCase();
  const cName = category.name.trim().toLowerCase();
  const cSlug = category.slug.trim().toLowerCase();

  if (pCatId && (pCatId === cId || pCatId === cSlug)) {
    return true;
  }
  if (pCatName && (pCatName === cName || pCatName === cSlug)) {
    return true;
  }
  return false;
}

export async function getLinkedProductsForCategoryInFirestore(
  category: Pick<AdminCategoryRecord, 'id' | 'name' | 'slug'>
): Promise<LinkedCategoryProductInfo[]> {
  if (!firestoreDb) {
    return [];
  }
  const snap = await getDocs(
    collection(firestoreDb, ZEMIGO_COLLECTIONS.products)
  );
  const matches: LinkedCategoryProductInfo[] = [];
  for (const d of snap.docs) {
    const raw = d.data() as Record<string, unknown>;
    const pCatId = String(raw.categoryId ?? raw.category_id ?? '').trim();
    const pCatName = String(raw.categoryName ?? raw.category ?? '').trim();
    if (
      doesProductMatchCategory(
        { categoryId: pCatId, categoryName: pCatName },
        category
      )
    ) {
      matches.push({
        id: d.id,
        name: String(raw.name ?? raw.title ?? 'Unnamed Product'),
        approvalStatus: String(raw.approvalStatus ?? 'pending'),
      });
    }
  }
  return matches;
}

/**
 * Deletes ONLY the category document. Never modifies or deletes product records.
 */
export async function deleteCategoryInFirestore(
  categoryId: string
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await deleteDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.categories, categoryId));
}

export function splitBannerOfferText(offerText: string): {
  discountPrefix: string;
  discountHighlight: string;
  discountText: string;
} {
  const clean = offerText.trim();
  if (!clean) {
    return {
      discountPrefix: '',
      discountHighlight: '',
      discountText: '',
    };
  }
  const match = clean.match(/^(up\s+to|flat|save|min(?:imum)?)\s+(.+)$/i);
  if (match) {
    return {
      discountPrefix: `${match[1]} `,
      discountHighlight: match[2].trim(),
      discountText: clean,
    };
  }
  return {
    discountPrefix: '',
    discountHighlight: clean,
    discountText: clean,
  };
}

function validateBannerImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const isValid =
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/');
  if (!isValid) {
    throw new Error('Invalid banner image URL. Only HTTPS/HTTP/data URLs are allowed.');
  }
  return trimmed;
}

export interface BannerWriteInput {
  title: string;
  discountText: string;
  subtitle: string;
  buttonText?: string;
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  targetType?: 'none' | 'category' | 'product' | 'link';
  targetCategoryId?: string | null;
  targetCategoryName?: string | null;
  targetProductId?: string | null;
  targetProductName?: string | null;
  navigationTarget?: string | null;
  displayOrder?: number;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createBannerInFirestore(
  input: BannerWriteInput
): Promise<string> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    throw new Error('Banner title / headline is required.');
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error('Banner end date cannot be earlier than start date.');
  }

  const offer = splitBannerOfferText(input.discountText);
  const validatedImg = validateBannerImageUrl(input.imageUrl);
  const cleanBtn = input.buttonText?.trim() || 'Shop Now';
  const order =
    typeof input.displayOrder === 'number' &&
    Number.isFinite(input.displayOrder) &&
    input.displayOrder >= 0
      ? Math.round(input.displayOrder)
      : 1;

  const created = await addDoc(
    collection(firestoreDb, ZEMIGO_COLLECTIONS.banners),
    {
      title: cleanTitle,
      badgeText: cleanTitle,
      discountPrefix: offer.discountPrefix,
      discountHighlight: offer.discountHighlight,
      discountText: offer.discountText,
      subtitle: input.subtitle.trim(),
      buttonText: cleanBtn,
      ctaText: cleanBtn,
      imageUrl: validatedImg,
      imageWidth: input.imageWidth ?? null,
      imageHeight: input.imageHeight ?? null,
      targetType: input.targetType ?? 'none',
      targetCategoryId: input.targetCategoryId?.trim() || null,
      targetCategoryName: input.targetCategoryName?.trim() || null,
      targetProductId: input.targetProductId?.trim() || null,
      targetProductName: input.targetProductName?.trim() || null,
      navigationTarget: input.navigationTarget?.trim() || null,
      displayOrder: order,
      active: input.active !== false,
      startDate: input.startDate?.trim() || null,
      endDate: input.endDate?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
  return created.id;
}

export async function updateBannerInFirestore(
  bannerId: string,
  input: BannerWriteInput
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    throw new Error('Banner title / headline is required.');
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new Error('Banner end date cannot be earlier than start date.');
  }

  const offer = splitBannerOfferText(input.discountText);
  const cleanBtn = input.buttonText?.trim() || 'Shop Now';
  const order =
    typeof input.displayOrder === 'number' &&
    Number.isFinite(input.displayOrder) &&
    input.displayOrder >= 0
      ? Math.round(input.displayOrder)
      : 1;

  const payload: Record<string, unknown> = {
    title: cleanTitle,
    badgeText: cleanTitle,
    discountPrefix: offer.discountPrefix,
    discountHighlight: offer.discountHighlight,
    discountText: offer.discountText,
    subtitle: input.subtitle.trim(),
    buttonText: cleanBtn,
    ctaText: cleanBtn,
    targetType: input.targetType ?? 'none',
    targetCategoryId: input.targetCategoryId?.trim() || null,
    targetCategoryName: input.targetCategoryName?.trim() || null,
    targetProductId: input.targetProductId?.trim() || null,
    targetProductName: input.targetProductName?.trim() || null,
    navigationTarget: input.navigationTarget?.trim() || null,
    displayOrder: order,
    active: input.active !== false,
    startDate: input.startDate?.trim() || null,
    endDate: input.endDate?.trim() || null,
    updatedAt: serverTimestamp(),
  };

  if (input.imageUrl !== undefined) {
    payload.imageUrl = validateBannerImageUrl(input.imageUrl);
    payload.imageWidth = input.imageWidth ?? null;
    payload.imageHeight = input.imageHeight ?? null;
  }

  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.banners, bannerId),
    payload,
    { merge: true }
  );
}

export async function toggleBannerActiveInFirestore(
  bannerId: string,
  active: boolean
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.banners, bannerId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes ONLY the banner document. Never touches products or categories.
 */
export async function deleteBannerInFirestore(bannerId: string): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await deleteDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.banners, bannerId));
}

export async function createCouponInFirestore(input: {
  code: string;
  title: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
}): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanCode = input.code.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleanCode || cleanCode.length < 3) {
    throw new Error('Coupon code must be at least 3 characters.');
  }
  if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
    throw new Error('Discount value must be greater than 0.');
  }
  if (input.discountType === 'percentage' && input.discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100%.');
  }
  const cleanMinOrder = Number.isFinite(input.minOrderValue)
    ? Math.max(0, input.minOrderValue)
    : 0;

  const existing = await getDocs(
    query(
      collection(firestoreDb, ZEMIGO_COLLECTIONS.coupons),
      where('code', '==', cleanCode)
    )
  );
  if (!existing.empty) {
    throw new Error(`Coupon code "${cleanCode}" already exists.`);
  }

  await addDoc(collection(firestoreDb, ZEMIGO_COLLECTIONS.coupons), {
    code: cleanCode,
    title: input.title.trim() || `${cleanCode} Offer`,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minOrderValue: cleanMinOrder,
    ...(typeof input.maxDiscount === 'number' &&
    Number.isFinite(input.maxDiscount) &&
    input.maxDiscount > 0
      ? { maxDiscount: input.maxDiscount }
      : {}),
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function toggleCouponActiveInFirestore(
  couponId: string,
  active: boolean
): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await updateDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.coupons, couponId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCouponInFirestore(couponId: string): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  await deleteDoc(doc(firestoreDb, ZEMIGO_COLLECTIONS.coupons, couponId));
}

export async function saveMarketplaceSettingsInFirestore(input: {
  defaultCommissionPercent: number;
  freeDeliveryThreshold: number;
  supportEmail: string;
}): Promise<void> {
  if (!firestoreDb) {
    throw new Error('Firebase Firestore is not configured.');
  }
  const cleanRate = Number(input.defaultCommissionPercent);
  if (!Number.isFinite(cleanRate) || cleanRate < 0 || cleanRate > 50) {
    throw new Error('Default commission percentage must be between 0% and 50%.');
  }
  const cleanThreshold = Number(input.freeDeliveryThreshold);
  if (!Number.isFinite(cleanThreshold) || cleanThreshold < 0) {
    throw new Error('Free delivery threshold cannot be negative.');
  }
  const cleanEmail = input.supportEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid support email address.');
  }
  await setDoc(
    doc(firestoreDb, ZEMIGO_COLLECTIONS.settings, 'marketplace'),
    {
      defaultCommissionPercent: cleanRate,
      freeDeliveryThreshold: cleanThreshold,
      supportEmail: cleanEmail,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
