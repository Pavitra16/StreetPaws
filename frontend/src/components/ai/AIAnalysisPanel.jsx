import { urgencyMeta } from '../../lib/urgency';

function Row({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-stone-500">{label}</dt>
      <dd className="text-stone-800">{Array.isArray(children) ? children.join(', ') : children}</dd>
    </div>
  );
}

const REPORTER_LABEL = { critical: 'Critical', injured: 'Injured', sick: 'Sick', healthy: 'Looks healthy' };

/**
 * When the model and the person who was actually there disagree sharply, show
 * both. Quietly displaying one number would hide the fact that a human looking
 * at the animal saw something the photo does not carry.
 */
function DisagreementNotice({ disagreement, condition }) {
  if (!disagreement) return null;
  const reporterHigher = disagreement.direction === 'reporter_higher';

  return (
    <div
      className={`mt-3 rounded-lg p-3 text-xs ${
        reporterHigher ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'
      }`}
    >
      {reporterHigher ? (
        <>
          <strong>The reporter rated this more serious than the photo shows.</strong> They marked it
          “{REPORTER_LABEL[condition] ?? condition}” (level {disagreement.reporter}); the automated
          read of the photo was level {disagreement.ai}. The injury may not be visible in the image —
          <strong> this case is queued at level {disagreement.reporter}</strong>, the higher of the two.
        </>
      ) : (
        <>
          <strong>The photo looks worse than the reporter indicated.</strong> They marked it “
          {REPORTER_LABEL[condition] ?? condition}” (level {disagreement.reporter}); the automated
          read was level {disagreement.ai}.{' '}
          <strong>This case is queued at level {disagreement.ai}</strong>, the higher of the two.
        </>
      )}
    </div>
  );
}

export default function AIAnalysisPanel({ analysis, state, condition, disagreement }) {
  if (state === 'pending' || state === 'processing') {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">AI assessment</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-stone-500">
          <span className="size-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
          Analysing the photo…
        </p>
      </section>
    );
  }

  if (!analysis || state === 'failed' || state === 'skipped') {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">AI assessment</h2>
        <p className="mt-2 text-sm text-stone-500">
          {state === 'failed'
            ? 'Automatic analysis failed for this photo. The reporter’s own description is above.'
            : 'No automatic analysis for this report.'}
        </p>
      </section>
    );
  }

  const u = urgencyMeta(analysis.urgency);
  const confidence = analysis.breedConfidence != null ? Math.round(analysis.breedConfidence * 100) : null;

  if (analysis.isDog === false) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-900">No dog found in this photo</h2>
        <p className="mt-2 text-sm text-amber-900">{analysis.generatedDescription}</p>
        <p className="mt-3 text-xs text-amber-800">
          Rescuers cannot act on this report as it stands. Please add a clear photo of the dog.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900">AI assessment</h2>
        {/* Explicitly "read from the photo", not the queue position. When the
            reporter overrides it, this number and the badge at the top of the
            page differ, and an unlabelled "Urgency 1" there reads as a
            contradiction. */}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${u.chip}`}>
          Read from photo: {analysis.urgency} · {u.label}
        </span>
      </div>

      <dl className="mt-3 divide-y divide-stone-100 text-sm">
        <Row label="Breed">
          {analysis.breed ? `${analysis.breed}${confidence != null ? ` (${confidence}% confident)` : ''}` : null}
        </Row>
        <Row label="Colours">{analysis.colors}</Row>
        <Row label="Coat">{analysis.coatPattern}</Row>
        <Row label="Size">{analysis.sizeEstimate}</Row>
        <Row label="Age">{analysis.ageEstimate}</Row>
        <Row label="Marks">{analysis.distinctiveMarks}</Row>
        <Row label="Visible issues">{analysis.injuries}</Row>
      </dl>

      <DisagreementNotice disagreement={disagreement} condition={condition} />

      {/* This ranks a queue. It does not decide anything, and it must never read
          as a diagnosis to someone deciding whether an animal needs a vet. */}
      <p className="mt-4 rounded-lg bg-stone-100 p-3 text-xs text-stone-700">
        <strong>Not a veterinary diagnosis.</strong> This is an automated read of the photo, used to
        order the rescuer queue. A trained person makes the actual call.
      </p>
    </section>
  );
}
