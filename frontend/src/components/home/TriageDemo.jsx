import { useReveal, usePrefersReducedMotion } from '../../hooks/useReveal';

const LEVEL = 4;

/**
 * A worked example of what the vision model returns for one photograph.
 *
 * The values shown are the shape of a real `aiAnalysis` document, and the
 * caveat under the meter is not decoration: urgency ranks a queue, it never
 * decides anything. The same wording appears on the actual report page, so a
 * visitor is not promised a different product from the one they get.
 */
export default function TriageDemo() {
  const [ref, shown] = useReveal({ threshold: 0.35 });
  const reduced = usePrefersReducedMotion();
  const on = shown || reduced;

  return (
    <div ref={ref} className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">AI assessment</h3>
          <p className="text-xs text-stone-500">not a veterinary diagnosis</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
          Injured
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Breed">Indian Pariah (mixed) · 78%</Row>
        <Row label="Colours">tan, white chest</Row>
        <Row label="Marks">torn left ear</Row>
        <Row label="Injuries">visible limp, front-right · open wound on flank</Row>
      </dl>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Urgency</span>
          <span className="text-sm font-bold text-stone-800">{LEVEL} of 5</span>
        </div>

        <div className="mt-2 flex gap-1.5" role="img" aria-label={`Urgency ${LEVEL} of 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full ${i <= LEVEL ? 'bg-amber-500' : 'bg-stone-200'}`}
              style={{
                transform: on || i > LEVEL ? 'scaleX(1)' : 'scaleX(0)',
                transformOrigin: 'left',
                transition: reduced ? 'none' : `transform 420ms cubic-bezier(.16,1,.3,1) ${i * 90}ms`,
              }}
            />
          ))}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          It ranks the queue so the worst case is seen first. A human always decides. The model can
          raise the urgency a reporter chose — never lower it.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 font-medium text-stone-800">{children}</dd>
    </div>
  );
}
