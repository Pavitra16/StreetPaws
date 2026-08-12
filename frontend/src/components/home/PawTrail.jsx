import { useReveal, usePrefersReducedMotion } from '../../hooks/useReveal';

/**
 * A line of paw prints that appear one after another, as though a dog walked
 * across the section. Used to connect the three steps instead of the usual
 * dotted rule.
 *
 * Paws alternate slightly above and below the centre line and tilt with the
 * direction of travel — a perfectly straight row of identical prints reads as
 * a border, not a trail.
 */
export default function PawTrail({ count = 7, className = '' }) {
  const [ref, shown] = useReveal({ threshold: 0.4 });
  const reduced = usePrefersReducedMotion();

  return (
    <div ref={ref} className={`flex items-center justify-between ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <svg
          key={i}
          viewBox="-22 -26 44 44"
          className="size-4 shrink-0 fill-brand-300 transition-opacity duration-500 motion-reduce:transition-none"
          style={{
            opacity: reduced || shown ? 1 : 0,
            transitionDelay: reduced ? '0ms' : `${i * 110}ms`,
            transform: `translateY(${i % 2 ? 5 : -5}px) rotate(${i % 2 ? 12 : -8}deg)`,
          }}
        >
          <ellipse cx="0" cy="0" rx="9" ry="7.4" />
          <ellipse cx="-10.5" cy="-9.5" rx="3.8" ry="4.9" />
          <ellipse cx="-3.5" cy="-13.5" rx="3.8" ry="5.1" />
          <ellipse cx="4.2" cy="-13" rx="3.8" ry="5.1" />
          <ellipse cx="10.5" cy="-8" rx="3.6" ry="4.6" />
        </svg>
      ))}
    </div>
  );
}
