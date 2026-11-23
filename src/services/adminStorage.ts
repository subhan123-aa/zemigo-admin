import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { firebaseStorage, isFirebaseConfigured } from '@/lib/firebase';

export type AdminAssetFolder =
  | 'vendors'
  | 'products'
  | 'categories'
  | 'banners';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (matches storage.rules)
const STORAGE_UPLOAD_TIMEOUT_MS = 5000;

async function compressImageToDataUrl(
  file: File,
  maxDimension = 640,
  quality = 0.78
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(
      'Firebase Storage upload failed: Storage bucket is unreachable or not provisioned.'
    );
  }

  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.naturalWidth || img.width || 400;
        let height = img.naturalHeight || img.height || 400;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Firebase Storage upload failed: Unable to process image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new Error('Firebase Storage upload failed while processing image.')
        );
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          'Firebase Storage error: Selected file could not be decoded as a valid image.'
        )
      );
    };

    img.src = objectUrl;
  });
}

/**
 * Uploads an image file to Firebase Storage under `zemigo/{folder}/`
 * with a 5-second timeout and compressed Data URL fallback if the Storage bucket
 * is not provisioned yet on the Firebase project.
 */
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export interface ImageDimensionCheckOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export async function readAndValidateImageDimensions(
  file: File,
  opts: ImageDimensionCheckOptions = {}
): Promise<{ width: number; height: number }> {
  const {
    minWidth = 300,
    minHeight = 140,
    maxWidth = 6000,
    maxHeight = 6000,
  } = opts;

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Browser image inspection is unavailable.');
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt =
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.webp');
  if (
    (file.type && !ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) ||
    (!file.type && !hasAllowedExt)
  ) {
    throw new Error(
      'Invalid image format: Only JPG, JPEG, PNG, and WEBP image files are supported.'
    );
  }

  if (file.size <= 0) {
    throw new Error('Selected image file is empty. Please choose another file.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image file size must be 5 MB or smaller.');
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      URL.revokeObjectURL(objectUrl);

      if (width <= 0 || height <= 0) {
        reject(new Error('Could not read valid dimensions from image file.'));
        return;
      }
      if (width < minWidth || height < minHeight) {
        reject(
          new Error(
            `Banner image dimensions too small (${width}×${height} px). Minimum recommended size is ${minWidth}×${minHeight} px.`
          )
        );
        return;
      }
      if (width > maxWidth || height > maxHeight) {
        reject(
          new Error(
            `Banner image dimensions too large (${width}×${height} px). Maximum supported is ${maxWidth}×${maxHeight} px.`
          )
        );
        return;
      }

      resolve({ width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          'Selected file could not be decoded as a valid JPG, PNG, or WEBP image.'
        )
      );
    };

    img.src = objectUrl;
  });
}

export interface BannerUploadResult {
  url: string;
  storageMode: 'firebase-storage' | 'inline-compressed-data-url';
  storageWarning?: string;
  width: number;
  height: number;
}

/**
 * Validates and uploads a banner image. Attempts Firebase Storage first;
 * if Storage is unprovisioned/unavailable, stores a validated compressed JPEG
 * Data URL fallback and surfaces an explicit informational warning.
 */
export async function uploadBannerAsset(
  file: File
): Promise<BannerUploadResult> {
  const { width, height } = await readAndValidateImageDimensions(file, {
    minWidth: 300,
    minHeight: 140,
  });

  if (!isFirebaseConfigured || !firebaseStorage) {
    throw new Error(
      'Firebase Storage is not configured. Check VITE_FIREBASE_* credentials in .env.'
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `zemigo/banners/${Date.now()}_${safeName}`;
  const storageRef = ref(firebaseStorage, storagePath);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });
      return getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            'Firebase Storage upload timed out (Storage bucket may not be provisioned on zemigo-2dfa5).'
          )
        );
      }, STORAGE_UPLOAD_TIMEOUT_MS);
    });

    const url = await Promise.race([uploadPromise, timeoutPromise]);
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Firebase Storage returned an empty download URL.');
    }

    return {
      url: url.trim(),
      storageMode: 'firebase-storage',
      width,
      height,
    };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    const message =
      err instanceof Error ? err.message : 'Firebase Storage unavailable.';

    if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
      throw new Error(
        `Firebase Storage permission denied (${code}): Only authorized Admin accounts can upload banners.`
      );
    }

    const compressed = await compressImageToDataUrl(file, 900, 0.8);
    const bounded =
      compressed.length > 720_000
        ? await compressImageToDataUrl(file, 640, 0.68)
        : compressed;

    if (!bounded || !bounded.startsWith('data:image/')) {
      throw new Error('Banner image compression failed. Please try another file.');
    }

    return {
      url: bounded,
      storageMode: 'inline-compressed-data-url',
      storageWarning: `Firebase Storage bucket is unavailable (${code || message}). Banner saved with validated inline compressed image fallback. Provision Firebase Storage in Firebase Console or configure Cloudinary/HTTPS CDN for external URL hosting.`,
      width,
      height,
    };
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export async function uploadAdminAsset(
  folder: AdminAssetFolder,
  file: File
): Promise<string> {
  if (!isFirebaseConfigured || !firebaseStorage) {
    throw new Error(
      'Firebase Storage error: Storage is not configured yet. Add your Firebase credentials to .env.'
    );
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt =
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.webp');
  if (
    (file.type && !ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) ||
    (!file.type && !hasAllowedExt)
  ) {
    throw new Error(
      'Invalid image format: Only PNG, JPG, JPEG, and WEBP image files are allowed.'
    );
  }

  if (file.size <= 0) {
    throw new Error('Selected image file is empty. Please choose another file.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      'Firebase Storage error: Image size must be under 5 MB.'
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `zemigo/${folder}/${Date.now()}_${safeName}`;
  const storageRef = ref(firebaseStorage, storagePath);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });
      return getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            'Firebase Storage upload timed out (Storage bucket may not be provisioned yet).'
          )
        );
      }, STORAGE_UPLOAD_TIMEOUT_MS);
    });

    const url = await Promise.race([uploadPromise, timeoutPromise]);
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Firebase Storage returned an empty download URL.');
    }
    return url.trim();
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';

    if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
      throw new Error(
        `Firebase Storage permission denied (${code}): Only admins can upload global marketplace assets.`
      );
    }

    const fallbackDataUrl = await compressImageToDataUrl(file);
    if (!fallbackDataUrl || !fallbackDataUrl.startsWith('data:image/')) {
      throw new Error('Image processing failed: Could not produce a valid image.');
    }
    if (fallbackDataUrl.length > 750_000) {
      return await compressImageToDataUrl(file, 480, 0.65);
    }
    return fallbackDataUrl;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
