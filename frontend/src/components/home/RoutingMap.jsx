import { useReveal, usePrefersReducedMotion } from '../../hooks/useReveal';

/**
 * A stylised illustration of the routing step — not a real map.
 *
 * Deliberately schematic rather than a Leaflet embed: this is a diagram of how
 * a report reaches a rescuer, and a real tile layer here would cost a network
 * round trip on the landing page to say something a drawing says faster.
 * Distances match the seeded reports so the illustration and the product agree.
 */
const RESCUERS = [
  { x: 132, y: 96, km: '1.4 km', name: 'Karuna Animal Aid', delay: 250 },
  { x: 236, y: 158, km: '3.2 km', name: 'Paws & Claws Trust', delay: 420 },
  { x: 84, y: 196, km: '5.8 km', name: 'Imran Qureshi', delay: 590 },
];

export default function RoutingMap() {
  const [ref, shown] = useReveal({ threshold: 0.3 });
  const reduced = usePrefersReducedMotion();
  const on = shown || reduced;

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-4"
    >
      <svg viewBox="0 0 320 260" className="h-auto w-full" role="img"
        aria-label="A reported dog at the centre, with the three nearest rescuers at 1.4, 3.2 and 5.8 kilometres.">
        {/* Street grid — suggestion of a city, kept very light so the pins own
            the image. */}
        <g stroke="var(--color-stone-200)" strokeWidth="1.5">
          <path d="M0 60 H320 M0 130 H320 M0 200 H320" />
          <path d="M70 0 V260 M170 0 V260 M255 0 V260" />
        </g>
        <path d="M0 96 L320 172" stroke="var(--color-stone-200)" strokeWidth="6" fill="none" />

        {/* Reach radius. Expands once when scrolled to, then rests — a
            permanently pulsing ring turns into a nervous tic on a page you sit
            and read. */}
        <circle
          cx="170" cy="130" r="92"
          fill="var(--color-brand-500)" fillOpacity="0.07"
          stroke="var(--color-brand-300)" strokeWidth="1.5" strokeDasharray="5 5"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transform: on ? 'scale(1)' : 'scale(0.4)',
            opacity: on ? 1 : 0,
            transition: reduced ? 'none' : 'transform 900ms cubic-bezier(.16,1,.3,1), opacity 500ms',
          }}
        />

        {/* Lines from each rescuer to the report. */}
        {RESCUERS.map((r) => (
          <line
            key={r.km}
            x1="170" y1="130" x2={r.x} y2={r.y}
            stroke="var(--color-brand-300)" strokeWidth="1.5" strokeDasharray="4 4"
            style={{
              opacity: on ? 1 : 0,
              transition: reduced ? 'none' : `opacity 400ms ${r.delay}ms`,
            }}
          />
        ))}

        {/* The rescuers. */}
        {RESCUERS.map((r) => (
          <g
            key={r.name}
            style={{
              opacity: on ? 1 : 0,
              transform: on ? 'translateY(0)' : 'translateY(6px)',
              transition: reduced ? 'none' : `opacity 400ms ${r.delay}ms, transform 400ms ${r.delay}ms`,
            }}
          >
            <circle cx={r.x} cy={r.y} r="7" fill="var(--color-brand-600)" />
            <circle cx={r.x} cy={r.y} r="12" fill="none" stroke="var(--color-brand-300)" strokeWidth="1.5" />
            <text
              x={r.x} y={r.y - 20} textAnchor="middle"
              className="fill-stone-600 text-[11px] font-semibold"
            >
              {r.km}
            </text>
          </g>
        ))}

        {/* The report itself — larger and darker than the rescuers, because the
            dog is the subject of the picture. */}
        <g>
          <circle cx="170" cy="130" r="15" fill="var(--color-brand-700)" />
          <circle cx="170" cy="130" r="15" fill="none" stroke="#fff" strokeWidth="3" />
          <text x="170" y="166" textAnchor="middle" className="fill-stone-700 text-[11px] font-bold">
            Reported dog
          </text>
        </g>
      </svg>
    </div>
  );
}
