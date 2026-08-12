import { useEffect, useRef, useState } from 'react';

/**
 * True when the visitor has asked the operating system for less motion.
 *
 * Every animation on the landing page checks this. Motion here is decoration;
 * for someone with vestibular sensitivity it is a reason to close the tab, and
 * this site is meant to be usable by a person standing on a street next to an
 * injured animal.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Reveals an element once it scrolls into view.
 *
 * Returns [ref, shown]. Deliberately one-way — elements do not un-reveal when
 * scrolled back past, because content flickering in and out on an upward scroll
 * reads as a rendering fault rather than an effect.
 */
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -10% 0px' } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

    // Without IntersectionObserver the content must still be visible.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    // Anything already on screen at mount is shown at once. The hero should
    // not wait on an observer callback to become readable.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setShown(true);
      return;
    }

    let fired = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        fired = true;
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    io.observe(el);

    /**
     * Fail open.
     *
     * A page that hides all its content behind an observer is invisible
     * wherever that observer never runs — a prerendered tab, an embedded
     * webview, a background frame that is not compositing. If nothing has
     * been delivered shortly after observing, assume it never will be and
     * show the content. Losing an animation is a nuisance; losing the page
     * is not survivable.
     */
    const failsafe = setTimeout(() => {
      if (!fired) setShown(true);
    }, 800);

    return () => {
      clearTimeout(failsafe);
      io.disconnect();
    };
  }, [shown, threshold, rootMargin]);

  return [ref, shown];
}
