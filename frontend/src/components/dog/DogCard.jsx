import { Link } from 'react-router-dom';
import { urgencyMeta, timeAgo, CONDITION_LABEL, STATUS_LABEL } from '../../lib/urgency';
import { reportText, reportBreed } from '../../lib/reportText';

export default function DogCard({ report, selected, onHover }) {
  const u = urgencyMeta(report.effectiveUrgency);
  const isLost = report.kind === 'lost';
  const body = reportText(report);
  const breed = reportBreed(report);

  return (
    <Link
      to={`/reports/${report.id}`}
      onMouseEnter={() => onHover?.(report.id)}
      className={[
        'flex gap-3 rounded-xl border bg-white p-3 transition-all',
        selected ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 hover:border-stone-300 hover:shadow-sm',
      ].join(' ')}
    >
      {report.primaryMedia?.thumbnailUrl ? (
        <img
          src={report.primaryMedia.thumbnailUrl}
          alt=""
          className="size-20 shrink-0 rounded-lg bg-stone-100 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid size-20 shrink-0 place-items-center rounded-lg bg-stone-100 text-2xl">🐕</div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${u.chip}`}>
            {u.label}
          </span>
          {isLost && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-600/20">
              Lost dog
            </span>
          )}
          {report.status !== 'open' && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
              {STATUS_LABEL[report.status] ?? report.status}
            </span>
          )}
        </div>

        <p className="mt-1 truncate text-sm font-semibold text-stone-900">
          {isLost && report.dogName ? `${report.dogName} — ` : ''}
          {breed.text ?? CONDITION_LABEL[report.condition]}
        </p>
        <p className={`mt-0.5 line-clamp-2 text-sm ${body.empty ? 'text-stone-400 italic' : 'text-stone-600'}`}>
          {body.generated && (
            <span className="mr-1 rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500">
              AI
            </span>
          )}
          {body.text}
        </p>

        <p className="mt-1 text-xs text-stone-400">
          {report.distanceKm != null && <>{report.distanceKm} km away · </>}
          {timeAgo(report.occurredAt)}
          {report.location?.city ? ` · ${report.location.city}` : ''}
        </p>
      </div>
    </Link>
  );
}
