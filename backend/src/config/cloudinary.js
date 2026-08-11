import { v2 as cloudinary } from 'cloudinary';
import { env, featureStatus } from './env.js';

if (featureStatus().cloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

export { cloudinary };

export function isCloudinaryConfigured() {
  return featureStatus().cloudinary;
}

/**
 * Builds a transformed delivery URL from a stored public ID.
 *
 * Doing this at read time rather than storing fixed URLs means we can change
 * thumbnail sizes later without re-uploading anything, and it is what lets the
 * AI step request a ~1024px version instead of a 4 MB phone photo.
 */
export function buildUrl(publicId, { width, height, crop = 'fill', resourceType = 'image' } = {}) {
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    secure: true,
    transformation: [
      { width, height, crop, quality: 'auto', fetch_format: 'auto' },
    ],
  });
}

export const THUMB = { width: 400, height: 300 };
export const DISPLAY = { width: 1200, height: 900, crop: 'limit' };
// Vision models gain nothing from a full-resolution photo, and a smaller image
// is markedly cheaper per call.
export const ANALYSIS = { width: 1024, height: 1024, crop: 'limit' };
