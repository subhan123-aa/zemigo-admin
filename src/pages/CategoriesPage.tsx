import React, { useEffect, useMemo, useState } from 'react';

import {
  type LinkedCategoryProductInfo,
  buildCategorySlug,
  createCategoryInFirestore,
  deleteCategoryInFirestore,
  doesProductMatchCategory,
  getLinkedProductsForCategoryInFirestore,
  subscribeCategories,
  subscribeProducts,
  toggleCategoryActiveInFirestore,
  updateCategoryInFirestore,
} from '@/services/adminFirestore';
import { uploadAdminAsset } from '@/services/adminStorage';
import type { AdminCategoryRecord, AdminProductRecord } from '@/types/admin';
import { formatDisplayDate } from '@/utils/formatters';

const DEFAULT_CATEGORY_THUMBNAILS: Record<string, string> = {
  'cat-fashion': '/categories/cat-fashion.png',
  'cat-electronics': '/categories/cat-electronics.png',
  'cat-home-living': '/categories/cat-home-living.png',
  'cat-beauty': '/categories/cat-beauty.png',
  'cat-watches': '/categories/cat-watches.png',
  'cat-bags': '/categories/cat-bags.png',
  'cat-footwear': '/categories/cat-footwear.png',
  'cat-books': '/categories/cat-books.png',
  'cat-toys': '/categories/cat-toys.png',
  'cat-sports': '/categories/cat-sports.png',
  'cat-kitchen': '/categories/cat-kitchen.png',
};

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type CategoryStatusFilter = 'all' | 'active' | 'inactive';

function getCategoryDisplayImage(cat: AdminCategoryRecord): string | null {
  if (cat.imageUrl && cat.imageUrl.trim()) return cat.imageUrl.trim();
  if (cat.iconUrl && cat.iconUrl.trim()) return cat.iconUrl.trim();
  return (
    DEFAULT_CATEGORY_THUMBNAILS[cat.id] ??
    DEFAULT_CATEGORY_THUMBNAILS[`cat-${cat.slug}`] ??
    null
  );
}

const CategoryThumbnail: React.FC<{
  category: AdminCategoryRecord;
  sizeClass?: string;
}> = ({ category, sizeClass = 'w-12 h-12' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = getCategoryDisplayImage(category);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  if (src && !imgFailed) {
    return (
      <div
        className={`${sizeClass} rounded-xl bg-[#F3F4F6] border border-[#E5E7EB] overflow-hidden flex items-center justify-center shrink-0`}
      >
        <img
          src={src}
          alt={category.name}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain p-1"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-xl bg-[#EAF7EF] border border-[#DCFCE7] flex items-center justify-center shrink-0 text-[#15803D] font-bold text-[18px]`}
      title={category.name}
    >
      {category.icon || category.name.charAt(0).toUpperCase() || 'C'}
    </div>
  );
};

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<AdminCategoryRecord[]>([]);
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CategoryStatusFilter>('all');

  // Add / Edit modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AdminCategoryRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState('1');
  const [formActive, setFormActive] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removeImageRequested, setRemoveImageRequested] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Toggling status per row
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] =
    useState<AdminCategoryRecord | null>(null);
  const [checkingLinked, setCheckingLinked] = useState(false);
  const [linkedProducts, setLinkedProducts] = useState<
    LinkedCategoryProductInfo[]
  >([]);
  const [confirmOrphanAck, setConfirmOrphanAck] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubCats = subscribeCategories(
      (list) => {
        setCategories(list);
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        setLoadError(err.message);
        setLoading(false);
      }
    );
    const unsubProds = subscribeProducts(setProducts);
    return () => {
      unsubCats();
      unsubProds();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const linkedProductCountByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const cat of categories) {
      const count = products.filter((p) =>
        doesProductMatchCategory(
          { categoryId: p.categoryId, categoryName: p.categoryName },
          cat
        )
      ).length;
      map.set(cat.id, Math.max(count, 0));
    }
    return map;
  }, [categories, products]);

  const summary = useMemo(() => {
    const activeCount = categories.filter((c) => c.active).length;
    const inactiveCount = categories.length - activeCount;
    const totalLinked = Array.from(
      linkedProductCountByCategoryId.values()
    ).reduce((s, n) => s + n, 0);
    return {
      total: categories.length,
      active: activeCount,
      inactive: inactiveCount,
      linkedProducts: totalLinked,
    };
  }, [categories, linkedProductCountByCategoryId]);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories.filter((cat) => {
      if (statusFilter === 'active' && !cat.active) return false;
      if (statusFilter === 'inactive' && cat.active) return false;
      if (!q) return true;
      return (
        cat.name.toLowerCase().includes(q) ||
        cat.slug.toLowerCase().includes(q) ||
        (cat.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [categories, searchQuery, statusFilter]);

  const nextSuggestedOrder = useMemo(() => {
    const finiteOrders = categories
      .map((c) => c.displayOrder)
      .filter((n) => Number.isFinite(n) && n < 900);
    if (finiteOrders.length === 0) return categories.length + 1;
    return Math.max(...finiteOrders) + 1;
  }, [categories]);

  const clearLocalPreview = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(null);
    setSelectedFile(null);
  };

  const openAddModal = () => {
    clearLocalPreview();
    setEditingCategory(null);
    setFormName('');
    setFormIcon('');
    setFormDescription('');
    setFormDisplayOrder(String(nextSuggestedOrder));
    setFormActive(true);
    setExistingImageUrl(null);
    setRemoveImageRequested(false);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (cat: AdminCategoryRecord) => {
    clearLocalPreview();
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormIcon(cat.icon ?? '');
    setFormDescription(cat.description ?? '');
    setFormDisplayOrder(
      cat.displayOrder >= 900 ? String(categories.length) : String(cat.displayOrder)
    );
    setFormActive(cat.active);
    setExistingImageUrl(cat.imageUrl ?? cat.iconUrl ?? null);
    setRemoveImageRequested(false);
    setFormError(null);
    setFormOpen(true);
  };

  const closeFormModal = () => {
    if (saving) return;
    clearLocalPreview();
    setFormOpen(false);
    setEditingCategory(null);
    setFormError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    const dotIdx = lower.lastIndexOf('.');
    const ext = dotIdx >= 0 ? lower.slice(dotIdx) : '';
    const isValidMime =
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      file.type === 'image/webp';

    if (!isValidMime && !ALLOWED_EXTENSIONS.has(ext)) {
      setFormError(
        'Invalid file format. Please choose a PNG, JPG, JPEG, or WEBP image.'
      );
      return;
    }

    if (file.size <= 0) {
      setFormError('Selected file is empty. Please choose a valid image.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setFormError('Image must be smaller than 5 MB.');
      return;
    }

    clearLocalPreview();
    setFormError(null);
    setSelectedFile(file);
    setRemoveImageRequested(false);
    setLocalPreviewUrl(URL.createObjectURL(file));
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError('Category Name is required.');
      return;
    }

    const parsedOrder = Number(formDisplayOrder);
    if (!Number.isFinite(parsedOrder) || parsedOrder < 0) {
      setFormError('Display Order must be a non-negative number (e.g. 1, 2, 3).');
      return;
    }

    if (!editingCategory && !selectedFile && !formIcon.trim()) {
      setFormError(
        'Please upload a category image or provide an optional icon before saving.'
      );
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      let resolvedImageUrl: string | null | undefined;
      if (selectedFile) {
        resolvedImageUrl = await uploadAdminAsset('categories', selectedFile);
      } else if (removeImageRequested) {
        resolvedImageUrl = null;
      } else if (editingCategory) {
        resolvedImageUrl = undefined; // preserve existing image field cleanly
      } else {
        resolvedImageUrl = null;
      }

      if (editingCategory) {
        await updateCategoryInFirestore(editingCategory.id, {
          name: cleanName,
          description: formDescription,
          icon: formIcon,
          imageUrl: resolvedImageUrl,
          displayOrder: parsedOrder,
          active: formActive,
        });
        setToastMessage({
          type: 'success',
          text: `Category "${cleanName}" updated and synced with the Customer App.`,
        });
      } else {
        await createCategoryInFirestore({
          name: cleanName,
          description: formDescription,
          icon: formIcon,
          imageUrl: resolvedImageUrl ?? null,
          displayOrder: parsedOrder,
          active: formActive,
        });
        setToastMessage({
          type: 'success',
          text: `Category "${cleanName}" added and synced with the Customer App.`,
        });
      }

      clearLocalPreview();
      setFormOpen(false);
      setEditingCategory(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to save category.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: AdminCategoryRecord) => {
    setTogglingId(cat.id);
    setToastMessage(null);
    try {
      const nextActive = !cat.active;
      await toggleCategoryActiveInFirestore(cat.id, nextActive);
      setToastMessage({
        type: 'success',
        text: `"${cat.name}" is now ${nextActive ? 'Active (visible in Customer App)' : 'Inactive (hidden from Customer App)'}.`,
      });
    } catch (err) {
      setToastMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to update category status.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const openDeleteDialog = async (cat: AdminCategoryRecord) => {
    setDeleteTarget(cat);
    setLinkedProducts([]);
    setConfirmOrphanAck(false);
    setCheckingLinked(true);
    try {
      const matches = await getLinkedProductsForCategoryInFirestore(cat);
      setLinkedProducts(matches);
    } catch {
      const fallbackMatches = products
        .filter((p) =>
          doesProductMatchCategory(
            { categoryId: p.categoryId, categoryName: p.categoryName },
            cat
          )
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          approvalStatus: p.approvalStatus,
        }));
      setLinkedProducts(fallbackMatches);
    } finally {
      setCheckingLinked(false);
    }
  };

  const handleDeactivateInstead = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await toggleCategoryActiveInFirestore(deleteTarget.id, false);
      setToastMessage({
        type: 'success',
        text: `"${deleteTarget.name}" was deactivated instead of deleted. Linked products remain intact.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      setToastMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to deactivate category.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (linkedProducts.length > 0 && !confirmOrphanAck) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCategoryInFirestore(deleteTarget.id);
      setToastMessage({
        type: 'success',
        text: `Category "${deleteTarget.name}" deleted from Firestore. No product records were deleted.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      setToastMessage({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Unable to delete category.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const effectivePreviewSrc = removeImageRequested
    ? null
    : (localPreviewUrl ??
      existingImageUrl ??
      (editingCategory ? DEFAULT_CATEGORY_THUMBNAILS[editingCategory.id] : null));

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[26px] font-extrabold text-[#111827] tracking-tight">
            Categories
          </h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Manage marketplace categories in real time. Changes automatically
            reflect in the ZemiGo Customer App Home &amp; Categories screens.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[14px] px-4 py-2.5 shadow-sm transition-colors"
        >
          <span>+ Add New Category</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {toastMessage ? (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-[13.5px] font-medium flex items-center justify-between gap-3 ${
            toastMessage.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[12px] font-bold opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13.5px] text-[#B91C1C]">
          Firestore connection issue: {loadError}
        </div>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Total Categories
          </p>
          <p className="text-[24px] font-extrabold text-[#111827] mt-1">
            {summary.total}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Active (Customer Visible)
          </p>
          <p className="text-[24px] font-extrabold text-[#16A34A] mt-1">
            {summary.active}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Inactive (Hidden)
          </p>
          <p className="text-[24px] font-extrabold text-[#4B5563] mt-1">
            {summary.inactive}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4">
          <p className="text-[12.5px] font-medium text-[#6B7280]">
            Linked Catalog Products
          </p>
          <p className="text-[24px] font-extrabold text-[#111827] mt-1">
            {summary.linkedProducts}
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by name, slug, or description..."
            className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-[#F3F4F6] p-1 rounded-xl">
          {(
            [
              { key: 'all', label: `All (${summary.total})` },
              { key: 'active', label: `Active (${summary.active})` },
              { key: 'inactive', label: `Inactive (${summary.inactive})` },
            ] as { key: CategoryStatusFilter; label: string }[]
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

      {/* Category Table / Empty State */}
      <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[14px] text-[#6B7280]">
            Loading categories from Firestore...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] text-[#16A34A] flex items-center justify-center mx-auto mb-3 text-[24px] font-bold">
              🗂️
            </div>
            <h3 className="text-[17px] font-bold text-[#111827]">
              {categories.length === 0
                ? 'No categories found in Firestore'
                : 'No matching categories'}
            </h3>
            <p className="text-[13.5px] text-[#6B7280] mt-1">
              {categories.length === 0
                ? 'Create your first category with an image and display position to show it immediately in the Customer App.'
                : 'Try adjusting your search query or status filter.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {categories.length === 0 ? (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13.5px] px-4 py-2"
                >
                  + Add Category
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
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#ECEEF2] text-[#4B5563] text-[12.5px]">
                  <th className="py-3 px-4 text-left font-semibold">Order</th>
                  <th className="py-3 px-4 text-left font-semibold">
                    Category
                  </th>
                  <th className="py-3 px-4 text-left font-semibold">Slug</th>
                  <th className="py-3 px-4 text-center font-semibold">
                    Linked Products
                  </th>
                  <th className="py-3 px-4 text-center font-semibold">
                    Status
                  </th>
                  <th className="py-3 px-4 text-left font-semibold">
                    Created Date
                  </th>
                  <th className="py-3 px-4 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6] text-[14px]">
                {filteredCategories.map((cat) => {
                  const linkedCount =
                    linkedProductCountByCategoryId.get(cat.id) ?? 0;
                  const isBusy = togglingId === cat.id;

                  return (
                    <tr
                      key={cat.id}
                      className="hover:bg-[#F9FAFB]/70 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg bg-[#F3F4F6] text-[#374151] text-[12.5px] font-bold">
                          #{cat.displayOrder >= 900 ? '—' : cat.displayOrder}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <CategoryThumbnail category={cat} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[#111827] truncate">
                                {cat.name}
                              </span>
                              {cat.icon ? (
                                <span
                                  className="text-[13px]"
                                  title="Category Icon"
                                >
                                  {cat.icon}
                                </span>
                              ) : null}
                            </div>
                            {cat.description ? (
                              <p className="text-[12px] text-[#6B7280] truncate max-w-[260px]">
                                {cat.description}
                              </p>
                            ) : (
                              <p className="text-[11.5px] text-[#9CA3AF]">
                                ID: {cat.id}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <code className="px-2 py-1 rounded-md bg-[#F3F4F6] text-[#374151] text-[12px] font-mono">
                          {cat.slug}
                        </code>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                            linkedCount > 0
                              ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                              : 'bg-[#F3F4F6] text-[#6B7280]'
                          }`}
                        >
                          {linkedCount}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold ${
                            cat.active
                              ? 'bg-[#DCFCE7] text-[#15803D]'
                              : 'bg-[#F3F4F6] text-[#6B7280]'
                          }`}
                        >
                          {cat.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[13px] text-[#6B7280] whitespace-nowrap">
                        {cat.createdAt.getTime() > 0
                          ? formatDisplayDate(cat.createdAt)
                          : 'Default Catalog'}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            className="rounded-lg border border-[#E5E7EB] hover:border-[#16A34A] hover:text-[#15803D] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#374151] transition-colors"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleToggleActive(cat)}
                            className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
                              cat.active
                                ? 'border-[#E5E7EB] text-[#6B7280] hover:border-[#D97706] hover:text-[#D97706]'
                                : 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]'
                            }`}
                          >
                            {isBusy
                              ? '...'
                              : cat.active
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openDeleteDialog(cat)}
                            className="rounded-lg border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Category Modal */}
      {formOpen ? (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-extrabold text-[#111827]">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h2>
                <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                  Synced directly with Firestore `categories` and Customer App.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                disabled={saving}
                className="text-[#6B7280] hover:text-[#111827] text-[18px] font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              {formError ? (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] font-medium text-[#B91C1C]">
                  {formError}
                </div>
              ) : null}

              <div>
                <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Fresh Groceries, Fashion, Electronics"
                  className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                />
                {formName.trim() ? (
                  <p className="text-[12px] text-[#6B7280] mt-1">
                    Slug preview:{' '}
                    <code className="text-[#15803D] font-semibold">
                      {buildCategorySlug(formName) || 'category'}
                    </code>
                  </p>
                ) : null}
              </div>

              {/* Image Upload & Preview */}
              <div>
                <label className="block text-[13px] font-semibold text-[#374151] mb-1.5">
                  Category Image (PNG, JPG, WEBP — Max 5 MB)
                </label>

                <div className="flex items-center gap-4 p-3.5 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB]">
                  <div className="w-20 h-20 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center overflow-hidden shrink-0">
                    {effectivePreviewSrc ? (
                      <img
                        src={effectivePreviewSrc}
                        alt="Category preview"
                        className="w-full h-full object-contain p-1.5"
                      />
                    ) : (
                      <span className="text-[12px] text-[#9CA3AF] text-center px-2">
                        No image
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center rounded-lg bg-white border border-[#D1D5DB] hover:border-[#16A34A] hover:text-[#15803D] px-3 py-1.5 text-[12.5px] font-semibold text-[#374151] transition-colors">
                        <span>
                          {effectivePreviewSrc ? 'Replace Image' : 'Choose Image'}
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
                            clearLocalPreview();
                            setRemoveImageRequested(true);
                          }}
                          className="rounded-lg border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] px-2.5 py-1.5 text-[12px] font-semibold"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className="text-[11.5px] text-[#6B7280] truncate">
                      {selectedFile
                        ? `Selected: ${selectedFile.name}`
                        : effectivePreviewSrc
                          ? 'Image preview ready.'
                          : 'Upload an image or provide an emoji/icon below.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Category Icon (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    placeholder="e.g. 👗 or 🥦"
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                    Display Order / Position *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    required
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#374151] mb-1">
                  Short Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Briefly describe products included in this category..."
                  className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-2 text-[14px] text-[#111827] focus:border-[#16A34A] focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#111827]">
                    Active Status
                  </p>
                  <p className="text-[12px] text-[#6B7280]">
                    Only active categories appear in the Customer App.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="w-4 h-4 accent-[#16A34A]"
                  />
                  <span className="text-[13px] font-semibold text-[#15803D]">
                    {formActive ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeFormModal}
                  disabled={saving}
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
                    ? 'Saving Category...'
                    : editingCategory
                      ? 'Save Changes'
                      : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Dialog */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#ECEEF2] shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <CategoryThumbnail category={deleteTarget} sizeClass="w-12 h-12" />
              <div>
                <h2 className="text-[17px] font-extrabold text-[#111827]">
                  Delete &ldquo;{deleteTarget.name}&rdquo;?
                </h2>
                <p className="text-[12.5px] text-[#6B7280]">
                  Slug: {deleteTarget.slug}
                </p>
              </div>
            </div>

            {checkingLinked ? (
              <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-4 text-[13.5px] text-[#6B7280]">
                Checking Firestore products linked to this category...
              </div>
            ) : linkedProducts.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#FEF3C7] border border-[#FDE68A] p-3.5 text-[13px] text-[#92400E]">
                  <p className="font-bold">
                    Warning: {linkedProducts.length} product
                    {linkedProducts.length > 1 ? 's are' : ' is'} linked to this
                    category
                  </p>
                  <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-[12.5px]">
                    {linkedProducts.slice(0, 4).map((p) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                    {linkedProducts.length > 4 ? (
                      <li>+{linkedProducts.length - 4} more product(s)</li>
                    ) : null}
                  </ul>
                  <p className="mt-2 text-[12px]">
                    Deleting this category will NOT delete product records, but
                    those products may lose storefront category navigation.
                    Deactivating hides the category from customers safely.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-[12.5px] text-[#374151] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmOrphanAck}
                    onChange={(e) => setConfirmOrphanAck(e.target.checked)}
                    className="mt-0.5 accent-[#DC2626]"
                  />
                  <span>
                    I understand linked product records will not be deleted and
                    may require a category update.
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-[13.5px] text-[#4B5563]">
                No products are currently linked to{' '}
                <strong className="text-[#111827]">{deleteTarget.name}</strong>.
                Deleting this category removes it from Firestore immediately.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[#D1D5DB] hover:bg-[#F9FAFB] px-3.5 py-2 text-[13px] font-semibold text-[#374151]"
              >
                Cancel
              </button>

              {!checkingLinked && linkedProducts.length > 0 && deleteTarget.active ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeactivateInstead}
                  className="rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-[13px] px-4 py-2 disabled:opacity-60"
                >
                  {deleting ? 'Updating...' : 'Deactivate Instead'}
                </button>
              ) : null}

              <button
                type="button"
                disabled={
                  deleting ||
                  checkingLinked ||
                  (linkedProducts.length > 0 && !confirmOrphanAck)
                }
                onClick={handleConfirmDelete}
                className="rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-[13px] px-4 py-2 disabled:opacity-45"
              >
                {deleting ? 'Deleting...' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
