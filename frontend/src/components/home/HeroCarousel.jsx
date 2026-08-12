import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/useReveal';
import { heroImages } from '../../lib/heroImages';

const INTERVAL = 3000;

/**
 * The hero rotation — one image every INTERVAL ms, from src/assets/hero.
 *
 * Curated photographs only. Cheerful, playful dogs belong here: this is the
 * first thing a visitor sees, sitting beside "Report a dog now", and distress
 * imagery next to a call to action suppresses the action rather than driving
 * it. The injured dogs appear further down the page, where there is context
 * for them.
 *
 * There is deliberately no fallback to live adoption listings. Those are
 * photographed by rescuers on a phone at a shelter, for identification rather
 * than for a landing page, and silently substituting them would mean the most
 * prominent image on the site was chosen by whichever dog happened to be
 * listed last. An empty folder renders nothing, which is visible and fixable;
 * a quiet fallback is neither.
 *
 * Cross-faded by stacking every image and animating opacity rather than
 * swapping one `src`. Swapping makes the browser fetch on demand, so each
 * image's first appearance is a visible flash of empty box.
 *
 * Pauses on hover and on keyboard focus — the dots and the link are
 * interactive, and content that moves while you are aiming at it is hostile.
 *
 * Under prefers-reduced-motion it starts paused rather than rotating. An
 * unrequested auto-advancing carousel is exactly what that setting exists to
 * switch off — but the play button and the dots are both there, so that
 * visitor can start it or step through by hand. Nothing becomes unreachable.
 */
export default function HeroCarousel() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  // Two separate reasons to stop, because they end differently: hovering ends
  // when the pointer leaves, the explicit toggle only ends when clicked again.
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(reduced);

  const slides = heroImages;
  const running = !hoverPaused && !userPaused && slides.length > 1;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setI((n) => (n + 1) % slides.length), INTERVAL);
    return () => clearInterval(t);
  }, [running, slides.length]);

  /**
   * Pause on *keyboard* focus only.
   *
   * Pausing on any focus looked right and was badly wrong: clicking a dot
   * focuses that button, the pointer then leaves, and nothing ever blurs it —
   * so the rotation stopped permanently and looked broken. A keyboard user
   * tabbing through genuinely needs it held still; a mouse user clicking a dot
   * does not.
   */
  const onFocus = (e) => {
    if (e.target.matches(':focus-visible')) setHoverPaused(true);
  };

  if (slides.length === 0) return null;
  const current = slides[i] ?? slides[0];

  return (
    <div
      /* 4:3 rather than 4:5. The portrait crop set the whole hero's height,
         pushing the headline and the report button apart far enough that a
         1280px window could not show them together — which is the one
         pairing this section exists to make. */
      className="relative aspect-4/3 overflow-hidden rounded-2xl bg-brand-800 shadow-2xl"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={onFocus}
      onBlurCapture={() => setHoverPaused(false)}
    >
      {slides.map((s, n) => (
        <img
          key={s.id}
          src={s.url}
          alt={n === i ? (s.name ? `${s.name}, a rescued street dog` : 'A rescued street dog') : ''}
          aria-hidden={n === i ? undefined : 'true'}
          className="absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none"
          style={{ opacity: n === i ? 1 : 0 }}
          /**
           * All eager, priority split.
           *
           * `lazy` on the hidden slides defeated the reason for stacking them:
           * the browser deferred each one until it was needed, so the first
           * fade to it showed the empty background — exactly the flash that
           * stacking exists to avoid. They are a few hundred kilobytes in
           * total, so fetch them all; `fetchPriority` keeps them from
           * competing with the visible one for bandwidth.
           */
          loading="eager"
          fetchPriority={n === 0 ? 'high' : 'low'}
        />
      ))}

      {/* Rendered whenever there is more than one slide, even with no captions.
          Gating the whole overlay on caption text also hid the dots, which left
          an uncaptioned rotation with no manual control at all — and under
          reduced-motion, where it does not advance by itself, stuck on the
          first image permanently. */}
      {(slides.length > 1 || current.name || current.note) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-900/90 via-brand-900/45 to-transparent p-5">
          {/* aria-live so the name is announced when it changes on its own —
              otherwise a screen-reader user is told about one dog and then
              offered a link to a different one. */}
          {current.name && (
            <p className="text-lg font-bold" aria-live="polite">
              {current.name}
            </p>
          )}
          {current.note && <p className="text-xs text-brand-100">{current.note}</p>}

          <div className={`flex items-center gap-2 ${current.name || current.note ? 'mt-3' : ''}`}>
            {slides.map((s, n) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setI(n)}
                aria-label={s.name ? `Show ${s.name}` : `Show image ${n + 1}`}
                aria-current={n === i}
                className={`h-1.5 rounded-full transition-all ${
                  n === i ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
            {/**
              * An explicit control, not just hover.
              *
              * Content that updates on its own needs a way to stop it that does
              * not depend on holding a pointer still — and it makes the paused
              * state visible, so a stopped carousel reads as stopped rather
              * than as broken. It also starts at "paused" under
              * prefers-reduced-motion, which is what gives that visitor a way
              * to opt back in.
              */}
            {slides.length > 1 && (
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                aria-label={userPaused ? 'Start the slideshow' : 'Pause the slideshow'}
                className="ml-2 grid size-6 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                {userPaused ? (
                  <svg viewBox="0 0 12 12" className="size-3 fill-current" aria-hidden="true">
                    <path d="M3 1.5 L10 6 L3 10.5 Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 12 12" className="size-3 fill-current" aria-hidden="true">
                    <rect x="2.5" y="2" width="2.5" height="8" rx="0.7" />
                    <rect x="7" y="2" width="2.5" height="8" rx="0.7" />
                  </svg>
                )}
              </button>
            )}

            {current.href && (
              <Link
                to={current.href}
                className="ml-auto rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-white"
              >
                {current.name ? `Meet ${current.name} →` : 'See the dogs →'}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

