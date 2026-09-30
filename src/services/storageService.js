// ============================================
// TokoWarung — Storage Service (Cloudinary)
// ============================================
// Image storage pakai Cloudinary (bukan Firebase Storage) untuk:
// - Upload lebih cepat & reliable
// - Auto image optimization (WebP, responsive)
// - CDN global
// - Transformations on-the-fly (resize, crop, format)
//
// SECURITY:
// - Client HANYA pakai UNSIGNED UPLOAD (cloud name + upload preset saja)
// - API Secret HANYA di server-side (Cloud Functions) untuk signed operations
//   seperti: delete image, admin operations
//
// Untuk delete image, panggil Cloud Function (TODO: buat saat Phase 2)
// ============================================

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
const CLOUDINARY_BASE_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

// ----- Validate config -----
if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.warn(
    '[storageService] Cloudinary belum dikonfigurasi. Set VITE_CLOUDINARY_CLOUD_NAME dan VITE_CLOUDINARY_UPLOAD_PRESET di .env'
  );
}

// ============================================
// Upload image (UNSIGNED — aman untuk client)
// ============================================
/**
 * Upload image ke Cloudinary via unsigned upload preset.
 * @param {File} file — File object dari input[type=file]
 * @param {object} opts
 * @param {string} opts.folder — sub-folder di Cloudinary (mis: 'products', 'avatars')
 * @param {function} opts.onProgress — callback(progressPercent) untuk upload progress
 * @returns {Promise<{publicId: string, url: string, secureUrl: string, width: number, height: number, format: string, bytes: number}>}
 */
export function uploadImage(file, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('File tidak boleh kosong.'));
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      return reject(new Error('Cloudinary belum dikonfigurasi. Hubungi admin.'));
    }

    // Validate file type (image only)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return reject(new Error('Format file tidak didukung. Gunakan JPG/PNG/WEBP/GIF.'));
    }

    // Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return reject(new Error('Ukuran file maksimal 5MB.'));
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    if (opts.folder) {
      formData.append('folder', opts.folder);
    }
    // Tags untuk filtering di Cloudinary dashboard
    if (opts.tags?.length) {
      formData.append('tags', opts.tags.join(','));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL, true);

    // Upload progress
    if (opts.onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          opts.onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            publicId: response.public_id,
            url: response.url,
            secureUrl: response.secure_url,
            width: response.width,
            height: response.height,
            format: response.format,
            bytes: response.bytes,
            createdAt: response.created_at,
          });
        } else {
          console.error('[storageService] Cloudinary upload error:', response);
          const msg = response.error?.message || 'Upload gagal. Coba lagi.';
          reject(new Error(msg));
        }
      } catch (err) {
        console.error('[storageService] Parse error:', err);
        reject(new Error('Terjadi masalah saat upload. Coba lagi.'));
      }
    };

    xhr.onerror = () => {
      console.error('[storageService] Network error');
      reject(new Error('Koneksi internet bermasalah. Coba lagi.'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload dibatalkan.'));
    };

    xhr.send(formData);
  });
}

// ============================================
// Get optimized image URL (Cloudinary transformations)
// ============================================
/**
 * Generate optimized image URL dengan Cloudinary transformations.
 * Cloudinary akan auto-convert ke WebP untuk browser yang support.
 *
 * @param {string} publicId — Cloudinary public_id (mis: 'products/abc123')
 * @param {object} opts
 * @param {number} opts.width — resize width
 * @param {number} opts.height — resize height
 * @param {string} opts.crop — 'fill' | 'fit' | 'scale' | 'thumb' | 'limit'
 * @param {string} opts.gravity — 'auto' | 'face' | 'center'
 * @param {boolean} opts.webp — auto WebP conversion (default: true)
 * @param {number} opts.quality — 1-100 atau 'auto'
 * @param {string} opts.format — 'webp' | 'jpg' | 'png' | 'auto'
 * @returns {string} optimized image URL
 */
export function getImageUrl(publicId, opts = {}) {
  if (!publicId) return '';
  if (!CLOUD_NAME) return '';

  const {
    width,
    height,
    crop = 'limit',
    gravity = 'auto',
    quality = 'auto',
    format = 'auto',
    webp = true,
    dpr = 'auto',
  } = opts;

  const transformations = [];

  // Resize
  if (width || height) {
    let t = '';
    if (width) t += `w_${width}`;
    if (height) t += t ? `,` : '' + `h_${height}`;
    if (crop) t += `,c_${crop}`;
    if (gravity && crop === 'fill') t += `,g_${gravity}`;
    transformations.push(t);
  }

  // Quality & format (auto WebP)
  transformations.push(`q_${quality}`);
  transformations.push(`f_${webp ? 'auto' : format}`);
  transformations.push(`dpr_${dpr}`);

  const transformStr = transformations.filter(Boolean).join('/');
  return `${CLOUDINARY_BASE_URL}/${transformStr}/${publicId}`;
}

// ============================================
// Get thumbnail URL (untuk product card)
// ============================================
export function getThumbUrl(publicId, size = 200) {
  return getImageUrl(publicId, {
    width: size,
    height: size,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto:low',
    webp: true,
  });
}

// ============================================
// Get responsive srcset (untuk img srcset attribute)
// ============================================
export function getResponsiveSrcset(publicId, opts = {}) {
  const sizes = opts.sizes || [200, 400, 600, 800, 1000];
  return sizes
    .map((s) => `${getImageUrl(publicId, { width: s, crop: 'limit', quality: 'auto' })} ${s}w`)
    .join(', ');
}

// ============================================
// Get avatar URL (square, face-focused)
// ============================================
export function getAvatarUrl(publicId, size = 96) {
  return getImageUrl(publicId, {
    width: size,
    height: size,
    crop: 'thumb',
    gravity: 'face',
    quality: 'auto',
    webp: true,
  });
}

// ============================================
// Delete image — HANYA via Cloud Function (server-side)
// ============================================
/**
 * Delete image dari Cloudinary. Memerlukan API Secret.
 * Client TIDAK boleh hapus langsung — harus via Cloud Function.
 *
 * TODO: buat Cloud Function `deleteCloudinaryImage` yang menerima publicId,
 * verify ownership ( seller only untuk produk miliknya ), lalu hapus via
 * Cloudinary Admin SDK.
 */
export async function deleteImage(/* publicId */) {
  throw new Error('Delete image harus via Cloud Function. Belum diimplementasi di Phase 1.');
}

// ============================================
// Helper: get public ID dari full Cloudinary URL
// ============================================
export function extractPublicId(url) {
  if (!url) return '';
  // URL format: https://res.cloudinary.com/CLOUD_NAME/image/upload/TRANSFORMATIONS/public_id.ext
  const match = url.match(/\/image\/upload\/(?:[^/]+\/)*([^./]+)(?:\.[a-z]+)?$/i);
  return match ? match[1] : '';
}

// ============================================
// Upload helper dengan retry & fallback
// ============================================
export async function uploadImageWithRetry(file, opts = {}, maxRetries = 2) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await uploadImage(file, opts);
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // exponential backoff
      }
    }
  }
  throw lastError;
}
