/**
 * The StreetPaws mark — a paw print, drawn rather than an emoji.
 *
 * The 🐕 emoji it replaces rendered differently on every platform (a brown
 * shiba on Apple, a grey terrier on Windows, a beagle on Android), so the
 * product had no consistent logo at all. This is one vector shape that
 * inherits `currentColor`, so it takes the brand pink on light surfaces and
 * white on the coloured ones without a second asset.
 *
 * `plate` wraps it in a rounded gradient tile for use as an app icon; without
 * it you get the bare glyph, which suits inline and empty-state use.
 */
export default function PawMark({ className = 'size-6', plate = false, title }) {
  const glyph = (
    <svg
      viewBox="0 0 40 40"
      className={plate ? 'size-[58%]' : className}
      fill="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <ellipse cx="20" cy="26.5" rx="9.5" ry="7.6" />
      <ellipse cx="7.5" cy="15" rx="4.3" ry="5.6" />
      <ellipse cx="15.5" cy="9.5" rx="4.3" ry="5.8" />
      <ellipse cx="24.5" cy="9.5" rx="4.3" ry="5.8" />
      <ellipse cx="32.5" cy="15" rx="4.3" ry="5.6" />
    </svg>
  );

  if (!plate) return glyph;

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ${className}`}
    >
      {glyph}
    </span>
  );
}
