import { Link, useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { urgencyMeta, timeAgo, STATUS_LABEL } from '../../lib/urgency';
import { reportText, reportBreed } from '../../lib/reportText';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';

export default function RescuerCases() {
  const { orgId, organization, queue } = useOutletContext();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org-queue', orgId] });
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  };

  const respond = useMutation({
    mutationFn: async ({ alertId, decision, reason }) =>
      (await api.post(`/organizations/${orgId}/alerts/${alertId}/respond`, { decision, reason })).data,
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async ({ reportId, status }) =>
      (await api.post(`/organizations/${orgId}/reports/${reportId}/resolve`, { status })).data,
    onSuccess: invalidate,
  });

  if (!orgId) {
    return (
      <EmptyState
        icon="🏥"
        title="Your account is not linked to an organisation"
        description="Contact an administrator — this usually means the approval did not finish."
      />
    );
  }

  if (!queue) return <Spinner label="Loading your cases…" />;

  const org = queue.organization ?? organization;
  const busy = respond.isPending || setStatus.isPending;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Cases</h1>
        <p className="mt-1 text-sm text-stone-500">
          Dogs reported near you, most urgent first. New reports appear automatically.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Awaiting response" value={queue.counts.pending} tone={queue.counts.pending ? 'brand' : null} />
        <Stat label="Active cases" value={org?.activeCaseCount ?? 0} sub={`of ${org?.capacity ?? 0} capacity`} />
        <Stat label="Dogs helped" value={org?.responseStats?.resolved ?? 0} />
        <Stat
          label="Avg response"
          value={org?.responseStats?.avgResponseMinutes != null ? `${org.responseStats.avgResponseMinutes}m` : '—'}
        />
      </div>

      {queue.items.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nothing in your queue"
          description="New cases reported near you will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {queue.items.map((item) => (
            <CaseRow
              key={item.alertId}
              item={item}
              busy={busy}
              onRespond={(decision, reason) => respond.mutate({ alertId: item.alertId, decision, reason })}
              onStatus={(status) => setStatus.mutate({ reportId: item.report.id, status })}
            />
          ))}
        </ul>
      )}

      {(respond.isError || setStatus.isError) && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {(respond.error ?? setStatus.error).message}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'brand' ? 'border-brand-200 bg-brand-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {sub && <p className="text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

function CaseRow({ item, onRespond, onStatus, busy }) {
  const r = item.report;
  const u = urgencyMeta(r.effectiveUrgency);
  const body = reportText(r);
  const breed = reportBreed(r);
  const isAccepted = item.alertStatus === 'accepted';
  const closed = ['resolved', 'reunited', 'closed'].includes(r.status);

  return (
    <li className={`rounded-xl border bg-white p-4 ${r.effectiveUrgency >= 4 ? 'border-red-200' : 'border-stone-200'}`}>
      <div className="flex flex-wrap gap-4">
        {r.primaryMedia?.thumbnailUrl && (
          <img src={r.primaryMedia.thumbnailUrl} alt="" className="size-24 rounded-lg bg-stone-100 object-cover" loading="lazy" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${u.chip}`}>
              {u.label}
            </span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            <span className="text-[11px] text-stone-400">
              {item.distanceKm} km · alerted {timeAgo(item.sentAt)}
            </span>
          </div>

          <p className="mt-1 text-sm font-semibold">{breed.text ?? 'Unidentified breed'}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{body.text}</p>

          {!r.contact?.masked && (
            <p className="mt-1 text-sm">
              <span className="text-stone-500">Reporter:</span>{' '}
              <span className="font-medium">{r.contact?.name}</span>{' '}
              <a href={`tel:${r.contact?.phone}`} className="font-mono text-brand-700 hover:underline">
                {r.contact?.phone}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <Link to={`/reports/${r.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
          View full report
        </Link>
        <span className="flex-1" />

        {!isAccepted && !closed && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRespond('decline', 'Cannot take this case')}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Can’t take it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRespond('accept')}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Accept case
            </button>
          </>
        )}

        {isAccepted && !closed && (
          <>
            {r.status !== 'in_treatment' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus('in_treatment')}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
              >
                Mark in treatment
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus('resolved')}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Mark resolved
            </button>
          </>
        )}

        {closed && (
          <>
            <span className="text-xs font-medium text-green-700">Case closed</span>
            {/* The natural next step for a recovered street dog. Carries the
                report through so the listing form starts pre-filled. */}
            <Link
              to={`/rescuer/listings/new?fromReport=${r.id}`}
              className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            >
              List for adoption
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
