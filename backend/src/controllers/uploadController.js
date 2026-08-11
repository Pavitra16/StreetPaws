import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

/**
 * POST /api/uploads/signature
 *
 * The browser uploads straight to Cloudinary; the file bytes never touch this
 * server. To do that safely the client needs a signature, which can only be
 * produced with the API secret — so the secret stays here and the client gets a
 * short-lived token scoped to exactly the parameters we signed.
 *
 * The alternative (an unsigned upload preset) puts an open upload endpoint for
 * your account into the page source.
 */
export const createUploadSignature = asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured()) {
    throw ApiError.unavailable(
      'Image uploads are not configured on the server (missing Cloudinary credentials).'
    );
  }

  const timestamp = Math.round(Date.now() / 1000);

  // Every parameter here must also be sent by the client, byte-identical, or
  // Cloudinary rejects the upload with "Invalid Signature".
  const paramsToSign = {
    timestamp,
    folder: env.cloudinary.folder,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    env.cloudinary.apiSecret
  );

  res.json({
    signature,
    timestamp,
    folder: env.cloudinary.folder,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    // Client-side guardrails. Cloudinary enforces its own limits too, but
    // failing before a 40 MB upload starts is a better experience on mobile data.
    limits: {
      maxImageBytes: 10 * 1024 * 1024,
      maxVideoBytes: 60 * 1024 * 1024,
      acceptedImage: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      acceptedVideo: ['video/mp4', 'video/quicktime', 'video/webm'],
    },
  });
});
