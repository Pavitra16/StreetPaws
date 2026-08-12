import { useEffect, useState } from 'react';
import { useReveal, usePrefersReducedMotion } from '../../hooks/useReveal';

/**
 * Counts from zero to `value` once, when scrolled into view.
 *
 * Eased rather than linear so it decelerates into the final number instead of
 * stopping dead. Under reduced-motion, and before the value has loaded, it
 * simply prints the number — the figure is the point, the animation is not.
 */
export default function CountUp({ value, prefix = '', className = '', duration = 1100 }) {
  const [ref, shown] = useReveal();
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!shown || !Number.isFinite(value)) return;
    if (reduced) {
      setN(value);
      return;
    }

    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      setN(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, value, reduced, duration]);

  const display = Number.isFinite(value) ? (shown ? n : 0) : null;

  return (
    <span ref={ref} className={className}>
      {display == null ? '—' : `${prefix}${display.toLocaleString('en-IN')}`}
    </span>
  );
}
