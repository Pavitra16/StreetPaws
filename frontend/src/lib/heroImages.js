import captions from '../assets/hero/captions.js';

/**
 * The landing-page hero rotation, built from whatever is in assets/hero.
 *
 * `import.meta.glob` is resolved by Vite at build time, so adding a photograph
 * to that folder is the only step — there is no manifest to regenerate and no
 * upload to run. Files are hashed and served like any other build asset, which
 * also means they are cached forever and cost nothing per view, unlike the
 * Cloudinary-hosted dog photographs.
 *
 * `eager` because the list has to exist during the first render to decide
 * whether to fall back to adoption listings; the URLs are strings, not the
 * image bytes, so this costs nothing.
 */
const files = import.meta.glob('../assets/hero/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const heroImages = Object.entries(files)
  // Sorted by filename so 01-, 02- controls the order rather than glob order.
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const file = path.split('/').pop();
    const meta = captions[file] ?? {};
    return {
      id: file,
      url,
      name: meta.name ?? null,
      note: meta.note ?? null,
      href: meta.href ?? null,
    };
  });
