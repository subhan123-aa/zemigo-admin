import React, { useEffect, useMemo, useState } from 'react';

import {
  createBannerInFirestore,
  deleteBannerInFirestore,
  subscribeBanners,
  subscribeCategories,
  subscribeProducts,
  toggleBannerActiveInFirestore,
  updateBannerInFirestore,
} from '@/services/adminFirestore';
import {
  readAndValidateImageDimensions,
  uploadBannerAsset,
} from '@/services/adminStorage';
import type {
  AdminBannerRecord,
  AdminCategoryRecord,
  AdminProductRecord,
  BannerTargetType,
} from '@/types/admin';
import { formatDisplayDate } from '@/utils/formatters';

type BannerStatusFilter = 'all' | 'active' | 'inactive';

function isBannerCurrentlyWithinSchedule(
  banner: Pick<AdminBannerRecord, 'startDate' | 'endDate'>
): { inWindow: boolean; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;

  if (banner.startDate && todayKey < banner.startDate) {
    return { inWindow: false, label: `Starts ${banner.startDate}` };
  }
  if (banner.endDate && todayKey > banner.endDate) {
    return { inWindow: false, label: `Ended ${banner.endDate}` };
  }
  if (banner.startDate || banner.endDate) {
    return { inWindow: true, label: 'Within schedule' };
  }
  return { inWindow: true, label: 'Always visible when active' };
}

const BannerPreviewImage: React.FC<{
  src?: string | null;
  alt: string;
}> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src && src.trim() ? src.trim() : null;

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (resolvedSrc && !failed) {
    return (
      <img
        key={resolvedSrc}
        src={resolvedSrc}
        alt={alt}
        onError={() => setFailed(true)}
        className="w-full h-full object-contain p-1.5"
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-[#15803D] bg-[#EAF7EF] px-3 text-center">
      <span className="text-[22px] font-bold">🖼️</span>
      <span className="text-[11px] font-semibold mt-1 opacity-80">
        {failed ? 'Image unavailable' : 'No custom image'}
      </span>
    </div>
  );
};

export const BannersPage: React.FC = () => {
  const [banners, setBanners] = useState<AdminBannerRecord[]>([]);
  const [categories, setCategories] = useState<AdminCategoryRecord[]>([]);
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BannerStatusFilter>('all');

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] =
    useState<AdminBannerRecord | null>(null);
  const [title, setTitle] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [buttonText, setButtonText] = useState('Shop Now');
  const [targetType, setTargetType] = useState<BannerTargetType>('none');
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [targetProductId, setTargetProductId] = useState('');
  const [navigationTarget, setNavigationTarget] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Image state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [removeImageRequested, setRemoveImageRequested] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Row / Delete states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminBannerRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubB = subscribeBanners(
      (list) => {
        setBanners(list);
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        setLoadError(err.message);
        setLoading(false);
      }
    );
    const unsubC = subscribeCategories(setCategories);
    const unsubP = subscribeProducts(setProducts);
    return () => {
      unsubB();
      unsubC();
      unsubP();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const summary = useMemo(() => {
    const activeCount = banners.filter((b) => b.active).length;
    const inactiveCount = banners.length - activeCount;
    const scheduledCount = banners.filter(
      (b) => Boolean(b.startDate) || Boolean(b.endDate)
    ).length;
    return {
      total: banners.length,
      active: activeCount,
      inactive: inactiveCount,
      scheduled: scheduledCount,
    };
  }, [banners]);

  const filteredBanners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return banners.filter((b) => {
      if (statusFilter === 'active' && !b.active) return false;
      if (statusFilter === 'inactive' && b.active) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.discountText.toLowerCase().includes(q) ||
        b.subtitle.toLowerCase().includes(q)
      );
    });
  }, [banners, searchQuery, statusFilter]);

  const nextSuggestedOrder = useMemo(() => {
    const finite = banners
      .map((b) => b.displayOrder)
      .filter((n) => Number.isFinite(n) && n < 900);
    if (finite.length === 0) return banners.length + 1;
    return Math.max(...finite) + 1;
  }, [banners]);

  const clearLocalFile = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(null);
    setSelectedFile(null);
  };

  const openAddModal = () => {
    clearLocalFile();
    setEditingBanner(null);
    setTitle('');
    setDiscountText('Up to 50% Off');
    setSubtitle('');
    setButtonText('Shop Now');
    setTargetType('none');
    setTargetCategoryId('');
    setTargetProductId('');
    setNavigationTarget('');
    setDisplayOrder(String(nextSuggestedOrder));
    setActive(true);
    setStartDate('');
    setEndDate('');
    setExistingImageUrl(null);
    setImageDims(null);
    setRemoveImageRequested(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (b: AdminBannerRecord) => {
    clearLocalFile();
    setEditingBanner(b);
    setTitle(b.title);
    setDiscountText(b.discountText);
    setSubtitle(b.subtitle);
    setButtonText(b.buttonText || 'Shop Now');
    setTargetType(b.targetType || 'none');
    setTargetCategoryId(b.targetCategoryId ?? '');
    setTargetProductId(b.targetProductId ?? '');
    setNavigationTarget(b.navigationTarget ?? '');
    setDisplayOrder(
      b.displayOrder >= 900 ? String(banners.length) : String(b.displayOrder)
    );
    setActive(b.active);
    setStartDate(b.startDate ?? '');
    setEndDate(b.endDate ?? '');
    setExistingImageUrl(b.imageUrl ?? null);
    setImageDims(
      b.imageWidth && b.imageHeight
        ? { width: b.imageWidth, height: b.imageHeight }
        : null
    );
    setRemoveImageRequested(false);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    clearLocalFile();
    setModalOpen(false);
    setEditingBanner(null);
    setFormError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;

    setFormError(null);
    try {
      const dims = await readAndValidateImageDimensions(file, {
        minWidth: 300,
        minHeight: 140,
      });
      clearLocalFile();
      setSelectedFile(file);
      setImageDims(dims);
      setRemoveImageRequested(false);
      setLocalPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Invalid banner image file.'
      );
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Banner Title / Headline is required.');
      return;
    }

    const parsedOrder = Number(displayOrder);
    if (!Number.isFinite(parsedOrder) || parsedOrder < 0) {
      setFormError('Display order must be 0 or greater.');
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setFormError('End date cannot be earlier than Start date.');
      return;
    }

    if (targetType === 'category' && !targetCategoryId.trim()) {
      setFormError('Please select a target category.');
      return;
    }
    if (targetType === 'product' && !targetProductId.trim()) {
      setFormError('Please select or enter a target product.');
      return;
    }
    if (targetType === 'link' && !navigationTarget.trim()) {
      setFormError(
        'Please enter a destination route (e.g. /categories) or HTTPS URL.'
      );
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      let resolvedImageUrl: string | null | undefined;
      let resolvedWidth: number | null | undefined = imageDims?.width ?? null;
      let resolvedHeight: number | null | undefined = imageDims?.height ?? null;
      let storageWarning: string | undefined;

      if (selectedFile) {
        const uploadRes = await uploadBannerAsset(selectedFile);
        resolvedImageUrl = uploadRes.url;
        resolvedWidth = uploadRes.width;
        resolvedHeight = uploadRes.height;
        storageWarning = uploadRes.storageWarning;
      } else if (removeImageRequested) {
        resolvedImageUrl = null;
        resolvedWidth = null;
        resolvedHeight = null;
      } else if (editingBanner) {
        resolvedImageUrl = undefined;
      } else {
        resolvedImageUrl = null;
      }

      const selectedCategory = categories.find(
        (c) => c.id === targetCategoryId
      );
      const selectedProduct = products.find((p) => p.id === targetProductId);

      const writePayload = {
        title: cleanTitle,
        discountText: discountText.trim() || 'Special Offer',
        subtitle: subtitle.trim() || 'Shop top deals across ZemiGo',
        buttonText: buttonText.trim() || 'Shop Now',
        imageUrl: resolvedImageUrl,
        imageWidth: resolvedWidth,
        imageHeight: resolvedHeight,
        targetType,
        targetCategoryId:
          targetType === 'category' ? targetCategoryId.trim() : null,
        targetCategoryName:
          targetType === 'category'
            ? (selectedCategory?.name ?? editingBanner?.targetCategoryName ?? null)
            : null,
        targetProductId:
          targetType === 'product' ? targetProductId.trim() : null,
        targetProductName:
          targetType === 'product'
            ? (selectedProduct?.name ??
              editingBanner?.targetProductName ??
              targetProductId.trim())
            : null,
        navigationTarget:
          targetType === 'link' ? navigationTarget.trim() : null,
        displayOrder: parsedOrder,
        active,
        startDate: startDate || null,
        endDate: endDate || null,
      };

      if (editingBanner) {
        await updateBannerInFirestore(editingBanner.id, writePayload);
      } else {
        await createBannerInFirestore(writePayload);
      }

      setToast(
        storageWarning
          ? {
              type: 'warning',
              text: `Banner "${cleanTitle}" saved. Note: ${storageWarning}`,
            }
          : {
              type: 'success',
              text: editingBanner
                ? `Banner "${cleanTitle}" updated and synced to the Customer App.`
                : `Banner "${cleanTitle}" created and synced to the Customer App.`,
            }
      );

      clearLocalFile();
      setModalOpen(false);
      setEditingBanner(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to save banner.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (b: AdminBannerRecord) => {
    setTogglingId(b.id);
    setToast(null);
    try {
      const next = !b.active;
      await toggleBannerActiveInFirestore(b.id, next);
      setToast({
        type: 'success',
        text: `"${b.title}" is now ${next ? 'Active (visible on Home carousel)' : 'Inactive (hidden from customers)'}.`,
      });
    } catch (err) {
      setToast({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to update banner status.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBannerInFirestore(deleteTarget.id);
      setToast({
        type: 'success',
        text: `Banner "${deleteTarget.title}" deleted. Products and categories were not affected.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      setToast({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to delete banner.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const modalPreviewSrc = removeImageRequested
    ? null
    : (localPreviewUrl ?? existingImageUrl);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[26px] font-extrabold text-[#111827] tracking-tight">
            Banners
          </h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Manage promotional Home Screen carousel banners, scheduling, and CTA
            destinations in real time via Firestore.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[14px] px-4 py-2.5 shadow-sm transition-colors"
        >
          <span>+ Add New Banner</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {toast ? (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-[13.5px] font-medium flex items-start justify-between gap-3 ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : toast.type === 'warning'
                ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]'
                : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[12px] font-bold opacity-80 hover:opacity-100 shrink-0"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13.5px] text-[#B91C1C]">
          Firestore error loading banners: {loadError}
        </div>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Total Banners
          </p>
          <p className="text-[24px] font-extrabold text-[#111827] mt-1">
            {summary.total}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Active Carousel Slides
          </p>
          <p className="text-[24px] font-extrabold text-[#16A34A] mt-1">
            {summary.active}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Inactive / Hidden
          </p>
          <p className="text-[24px] font-extrabold text-[#4B5563] mt-1">
            {summary.inactive}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Scheduled Campaigns
          </p>
          <p className="text-[24px] font-extrabold text-[#111827] mt-1">
            {summary.scheduled}
          </p>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search banners by headline, offer text, or subtitle..."
            className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-[#F3F4F6] p-1 rounded-xl">
          {(
            [
              { key: 'all', label: `All (${summary.total})` },
              { key: 'active', label: `Active (${summary.active})` },
              { key: 'inactive', label: `Inactive (${summary.inactive})` },
            ] as { key: BannerStatusFilter; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                statusFilter === item.key
                  ? 'bg-white text-[#15803D] shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Card / Grid Layout */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-[#ECEEF2] p-12 text-center text-[14px] text-[#6B7280]">
          Loading banners from Firestore...
        </div>
      ) : filteredBanners.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] text-[#16A34A] flex items-center justify-center mx-auto mb-3 text-[24px]">
            🏷️
          </div>
          <h3 className="text-[17px] font-bold text-[#111827]">
            {banners.length === 0
              ? 'No promotional banners configured'
              : 'No matching banners'}
          </h3>
          <p className="text-[13.5px] text-[#6B7280] mt-1 max-w-md mx-auto">
            {banners.length === 0
              ? 'Create a promotional banner with image preview, CTA destination, and display order to feature it on the Customer App Home carousel.'
              : 'Try clearing the search query or switching status filter.'}
          </p>
          <div className="mt-4">
            {banners.length === 0 ? (
              <button
                type="button"
                onClick={openAddModal}
                className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13.5px] px-4 py-2"
              >
                + Add Banner
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="rounded-xl border border-[#D1D5DB] hover:border-[#16A34A] text-[#374151] font-semibold text-[13.5px] px-4 py-2"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredBanners.map((b) => {
            const schedule = isBannerCurrentlyWithinSchedule(b);
            const targetSummary =
              b.targetType === 'category'
                ? `Category: ${b.targetCategoryName || b.targetCategoryId}`
                : b.targetType === 'product'
                  ? `Product: ${b.targetProductName || b.targetProductId}`
                  : b.targetType === 'link'
                    ? `Target: ${b.navigationTarget}`
                    : 'Target: Featured Deals';
            const isBusy = togglingId === b.id;

            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card overflow-hidden flex flex-col justify-between"
              >
                {/* Top visual preview strip matching Customer App card aesthetics */}
                <div className="bg-[#EAF7EF] border-b border-[#DDF2E4] p-4 flex items-center justify-between gap-4 min-h-[146px]">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/90 text-[#111827] text-[11.5px] font-bold border border-[#D1FAE5]">
                        Order #{b.displayOrder >= 900 ? '—' : b.displayOrder}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold ${
                          b.active
                            ? 'bg-[#16A34A] text-white'
                            : 'bg-[#E5E7EB] text-[#4B5563]'
                        }`}
                      >
                        {b.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <h3 className="text-[19px] font-extrabold text-[#111827] leading-tight truncate">
                      {b.title}
                    </h3>
                    <p className="text-[17px] font-black text-[#16A34A] mt-0.5 truncate">
                      {b.discountText || 'Special Offer'}
                    </p>
                    <p className="text-[12.5px] text-[#374151] mt-1 line-clamp-2">
                      {b.subtitle || 'Shop top deals on ZemiGo'}
                    </p>
                    <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[#16A34A] text-white text-[11.5px] font-semibold px-3 py-1">
                      {b.buttonText || 'Shop Now'} →
                    </span>
                  </div>

                  <div className="w-32 h-28 sm:w-36 sm:h-32 rounded-xl bg-white/80 border border-[#DDF2E4] overflow-hidden shrink-0">
                    <BannerPreviewImage
                      src={b.imageUrl}
                      alt={b.title}
                    />
                  </div>
                </div>

                {/* Metadata & Actions Footer */}
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#6B7280]">
                    <span className="font-medium text-[#374151] bg-[#F3F4F6] px-2.5 py-1 rounded-lg">
                      {targetSummary}
                    </span>

                    <span>
                      {b.startDate || b.endDate
                        ? `Schedule: ${b.startDate || 'Any'} → ${b.endDate || 'Ongoing'}`
                        : schedule.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F3F4F6]">
                    <span className="text-[11.5px] text-[#9CA3AF]">
                      {b.createdAt.getTime() > 0
                        ? `Created ${formatDisplayDate(b.createdAt)}`
                        : `ID: ${b.id}`}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(b)}
                        className="rounded-lg border border-[#E5E7EB] hover:border-[#16A34A] hover:text-[#15803D] px-3 py-1.5 text-[12.5px] font-semibold text-[#374151] transition-colors"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleActive(b)}
                        className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
                          b.active
                            ? 'border-[#E5E7EB] text-[#6B7280] hover:border-[#D97706] hover:text-[#D97706]'
                            : 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]'
                        }`}
                      >
                        {isBusy
                          ? '...'
                          : b.active
                            ? 'Deactivate'
                            : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(b)}
                        className="rounded-lg border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Banner Modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-extrabold text-[#111827]">
                  {editingBanner ? 'Edit Banner' : 'Create Promotional Banner'}
                </h2>
                <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                  Updates synchronize automatically with the ZemiGo Customer App
                  Home Screen carousel.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="text-[#6B7280] hover:text-[#111827] text-[18px] font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="p-6 space-y-4">
              {formError ? (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] font-medium text-[#B91C1C]">
                  {formError}
                </div>
              ) : null}

              {/* Live Visual Banner Card Preview */}
              <div className="rounded-xl bg-[#EAF7EF] border border-[#DDF2E4] p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#15803D] mb-1">
                    Live Customer App Preview
                  </p>
                  <p className="text-[18px] font-black text-[#111827] truncate">
                    {title.trim() || 'Headline Preview'}
                  </p>
                  <p className="text-[16px] font-extrabold text-[#16A34A] truncate">
                    {discountText.trim() || 'Up to 70% Off'}
                  </p>
                  <p className="text-[12px] text-[#374151] mt-0.5 line-clamp-2">
                    {subtitle.trim() ||
                      'On Fashion, Electronics, Home & More'}
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-[#16A34A] text-white text-[11px] font-semibold px-3 py-1">
                    {buttonText.trim() || 'Shop Now'} →
                  </span>
                </div>
                <div className="w-28 h-24 rounded-xl bg-white border border-[#DDF2E4] overflow-hidden shrink-0">
                  <BannerPreviewImage
                    src={modalPreviewSrc}
                    alt="Banner preview"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Banner Title / Headline *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Big Sale, Weekend Flash"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Offer Text
                  </label>
                  <input
                    type="text"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    placeholder="e.g. Up to 70% Off"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. On Fashion, Electronics, Home & More"
                  className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-[13px] font-semibold text-[#374151] mb-1.5">
                  Banner Image (JPG, JPEG, PNG, WEBP — Min 300×140 px, Max 5 MB)
                </label>
                <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB]">
                  <label className="cursor-pointer inline-flex items-center rounded-lg bg-white border border-[#D1D5DB] hover:border-[#16A34A] hover:text-[#15803D] px-3.5 py-1.5 text-[13px] font-semibold text-[#374151] transition-colors">
                    <span>
                      {modalPreviewSrc ? 'Replace Image' : 'Upload Image'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {(localPreviewUrl || existingImageUrl) &&
                  !removeImageRequested ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearLocalFile();
                        setImageDims(null);
                        setRemoveImageRequested(true);
                      }}
                      className="rounded-lg border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1.5 text-[12px] font-semibold"
                    >
                      Remove Image
                    </button>
                  ) : null}

                  <span className="text-[12px] text-[#6B7280] flex-1 min-w-[160px]">
                    {selectedFile
                      ? `${selectedFile.name}${imageDims ? ` (${imageDims.width}×${imageDims.height} px)` : ''}`
                      : existingImageUrl && !removeImageRequested
                        ? `Current uploaded image${imageDims ? ` (${imageDims.width}×${imageDims.height} px)` : ''}`
                        : 'Select an image file from your computer.'}
                  </span>
                </div>
              </div>

              {/* CTA Button & Navigation Target */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Button Text
                  </label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="Shop Now"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    required
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
              </div>

              {/* Navigation Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    CTA Destination Type
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) =>
                      setTargetType(e.target.value as BannerTargetType)
                    }
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  >
                    <option value="none">General Featured Deals</option>
                    <option value="category">Target Category</option>
                    <option value="product">Target Product</option>
                    <option value="link">Custom Route / Deep Link</option>
                  </select>
                </div>

                <div>
                  {targetType === 'category' ? (
                    <>
                      <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                        Select Category *
                      </label>
                      <select
                        value={targetCategoryId}
                        onChange={(e) => setTargetCategoryId(e.target.value)}
                        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                      >
                        <option value="">Choose category...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} {!cat.active ? '(Inactive)' : ''}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : targetType === 'product' ? (
                    <>
                      <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                        Target Product *
                      </label>
                      {products.length > 0 ? (
                        <select
                          value={targetProductId}
                          onChange={(e) => setTargetProductId(e.target.value)}
                          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                        >
                          <option value="">Choose product...</option>
                          {targetProductId &&
                          !products.some((p) => p.id === targetProductId) ? (
                            <option value={targetProductId}>
                              {editingBanner?.targetProductName ||
                                targetProductId}
                            </option>
                          ) : null}
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.vendorName})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={targetProductId}
                          onChange={(e) => setTargetProductId(e.target.value)}
                          placeholder="Product ID (e.g. prod-headphones-anc)"
                          className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px]"
                        />
                      )}
                    </>
                  ) : targetType === 'link' ? (
                    <>
                      <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                        Route / Deep Link URL *
                      </label>
                      <input
                        type="text"
                        value={navigationTarget}
                        onChange={(e) => setNavigationTarget(e.target.value)}
                        placeholder="e.g. /categories, /products, or https://..."
                        className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                        Destination Info
                      </label>
                      <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-2 text-[13px] text-[#6B7280]">
                        Opens Featured Deals listing
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Optional Start / End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Start Date (optional)
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#111827]">
                    Active Status
                  </p>
                  <p className="text-[12px] text-[#6B7280]">
                    Only active banners within schedule appear in the Customer
                    App.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 accent-[#16A34A]"
                  />
                  <span className="text-[13px] font-semibold text-[#15803D]">
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeModal}
                  className="rounded-xl border border-[#D1D5DB] hover:bg-[#F9FAFB] px-4 py-2 text-[13.5px] font-semibold text-[#374151]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13.5px] px-5 py-2 disabled:opacity-60"
                >
                  {saving
                    ? 'Uploading & Saving...'
                    : editingBanner
                      ? 'Save Changes'
                      : 'Publish Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-2xl w-full max-w-md p-6">
            <h2 className="text-[17px] font-extrabold text-[#111827]">
              Delete Banner &ldquo;{deleteTarget.title}&rdquo;?
            </h2>
            <p className="text-[13.5px] text-[#4B5563] mt-2">
              This will permanently remove the banner from Firestore and hide it
              from the Customer App Home carousel. Existing products and
              categories will not be affected.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[#D1D5DB] hover:bg-[#F9FAFB] px-4 py-2 text-[13px] font-semibold text-[#374151]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-[13px] px-4 py-2 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Banner'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
