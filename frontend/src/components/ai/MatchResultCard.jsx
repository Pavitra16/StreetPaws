import { Link } from 'react-router-dom';
import { timeAgo } from '../../lib/urgency';
import { reportText, reportBreed } from '../../lib/reportText';

const SIGNALS = [
  { key: 'visual', label: 'Looks alike' },
  { key: 'attributes', label: 'Breed & markings' },
  { key: 'geo', label: 'Nearby' },
  { key: 'time', label: 'Timing fits' },
];

function Bar({ value }) {
  /**
   * A null signal was never compared — that is not the same as scoring zero,
   * and an empty progress bar reads as "no resemblance at all". Say so instead.
   */
  if (value == null) {
    return <span className="text-[11px] italic text-stone-400">not compared</span>;
  }

  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-stone-500">{pct}%</span>
    </div>
  );
}

export default function MatchResultCard({ result, rank }) {
  const b = result.matchBreakdown ?? {};
  const overall = Math.round((result.matchScore ?? 0) * 100);
  // Did anything about the animal itself get compared, or only where and when?
  const comparedAppearance = b.visual != null || b.attributes != null;
  const body = reportText(result);

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex gap-4">
        {result.primaryMedia?.thumbnailUrl ? (
          <img
            src={result.primaryMedia.thumbnailUrl}
            alt=""
            className="size-28 shrink-0 rounded-lg bg-stone-100 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid size-28 shrink-0 place-items-center rounded-lg bg-stone-100 text-3xl">🐕</div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                #{rank} · {reportBreed(result).text ?? 'Unidentified breed'}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {result.distanceKm != null && <>{result.distanceKm} km away · </>}
                seen {timeAgo(result.occurredAt)}
                {result.location?.city ? ` · ${result.location.city}` : ''}
              </p>
            </div>
            {/* The percentage has to state its own basis. Scored over the
                signals actually available, a dog compared only on location and
                time can reach 90% — which, unqualified, tells an owner they
                have found their dog when nothing about the animal was
                compared at all. */}
            <div className="shrink-0 text-right">
              <span className="inline-block rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-600/20">
                {overall}%
              </span>
              {!comparedAppearance && (
                <p className="mt-1 max-w-24 text-[10px] leading-tight text-amber-700">
                  on location &amp; time only
                </p>
              )}
            </div>
          </div>

          <p className={`mt-1.5 line-clamp-2 text-sm ${body.empty ? 'text-stone-400 italic' : 'text-stone-600'}`}>
            {body.generated && (
              <span className="mr-1 rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500">
                AI
              </span>
            )}
            {body.text}
          </p>

          {/* Owners scanning twenty tan dogs need to know WHY each one surfaced;
              a bare rank is not actionable. */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {SIGNALS.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <dt className="text-[11px] text-stone-500">{s.label}</dt>
                <dd>
                  <Bar value={b[s.key]} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <p className="text-xs text-stone-400">
          {comparedAppearance
            ? 'A ranking, not a confirmation — check the photo yourself.'
            : 'Nothing about this dog’s appearance was compared — only where and when it was seen.'}
        </p>
        <Link
          to={`/reports/${result.id}`}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Is this your dog?
        </Link>
      </div>
    </article>
  );
}
