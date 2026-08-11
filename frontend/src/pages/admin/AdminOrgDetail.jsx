import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import Spinner from '../../components/common/Spinner';
import { urgencyMeta, timeAgo, STATUS_LABEL } from '../../lib/urgency';
import { reportText } from '../../lib/reportText';

export default function AdminOrgDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'org-detail', id],
    queryFn: async () => (await api.get(`/admin/organizations/${id}/detail`)).data,
  });

  const review = useMutation({
    mutationFn: async (body) => (await api.post(`/admin/organizations/${id}/review`, body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (isPending) return <Spinner label="Loading organisation…" />;
  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">Could not load this organisation</p>
        <p className="mt-1 text-sm text-stone-500">{error.message}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-6 text-sm font-semibold text-stone-700 hover:underline"
        >
          ← Go back
        </button>
      </div>
    );
  }

  const { organization: org, performance: p, adoption, money, owner, recentCases } = data;
  const backTo = org.kind === 'ngo' ? '/admin/ngos' : '/admin/rescuers';

  return (
    <div className="space-y-6">
      <Link to={backTo} className="inline-block text-sm text-stone-500 hover:text-stone-800">
        ← Back to {org.kind === 'ngo' ? 'NGOs' : 'rescuers'}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
            <Badge tone={org.applicationStatus === 'approved' ? 'green' : 'stone'}>
              {org.applicationStatus}
            </Badge>
            <Badge tone="stone">{org.kind === 'ngo' ? 'NGO' : 'Independent rescuer'}</Badge>
            {org.verified ? (
              <Badge tone="sky">verified — sees contact details</Badge>
            ) : (
              <Badge tone="amber">unverified — contact details hidden</Badge>
            )}
          </div>
          {org.description && <p className="mt-2 max-w-2xl text-sm text-stone-600">{org.description}</p>}
        </div>

        {org.applicationStatus === 'approved' && (
          <button
            type="button"
            disabled={review.isPending}
            onClick={() => review.mutate({ decision: 'suspend', note: 'Suspended by administrator' })}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Suspend
          </button>
        )}
      </header>


      {/* The point of this page: what they have actually done, not what they
          claimed when registering. */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          How much they have helped
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Dogs helped" value={p.casesResolved} sub="cases resolved or reunited" big />
          <Metric label="Currently handling" value={`${p.activeCaseCount}/${p.capacity}`} sub="active cases vs capacity" />
          <Metric
            label="Acceptance rate"
            value={p.acceptanceRate == null ? '—' : `${Math.round(p.acceptanceRate * 100)}%`}
            sub={`${p.accepted} accepted of ${p.accepted + p.declined} answered`}
          />
          <Metric
            label="Average response"
            value={p.avgResponseMinutes == null ? '—' : `${p.avgResponseMinutes} min`}
            sub="from alert to accepting"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Alerts sent to them
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Total alerts" value={p.alertsReceived} />
          <Metric label="Accepted" value={p.accepted} />
          <Metric label="Declined" value={p.declined} />
          {/* Ignoring an alert is a different failure from declining it, and only
              one of the two is a problem worth acting on. */}
          <Metric label="Never answered" value={p.unanswered} tone={p.unanswered > 3 ? 'warn' : null} />
          <Metric label="Taken by someone else" value={p.expired} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Adoption</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <KV label="Dogs listed for adoption">{adoption.total}</KV>
            <KV label="Currently available">{adoption.available}</KV>
            <KV label="Successfully adopted">{adoption.adopted}</KV>
          </dl>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Money</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <KV label="Donated directly to them">
              ₹{money.donationsReceivedInr.toLocaleString('en-IN')}
              <span className="ml-1 text-xs text-stone-400">({money.donationCount} donations)</span>
            </KV>
            <KV label="Paid from the platform fund">
              ₹{money.payoutsReceivedInr.toLocaleString('en-IN')}
              <span className="ml-1 text-xs text-stone-400">({money.payoutCount} payouts)</span>
            </KV>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Registration details</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <KV label="Contact person">{org.contactPersonName ?? '—'}</KV>
          <KV label="Email">{org.email}</KV>
          <KV label="Phone">{org.phone}</KV>
          <KV label="PAN">{org.pan ?? '—'}</KV>
          <KV label="Registration no.">{org.registrationNumber ?? '—'}</KV>
          <KV label="Darpan ID">{org.darpanId ?? '—'}</KV>
          <KV label="Years active">{org.yearsActive ?? '—'}</KV>
          <KV label="Service area">
            {org.location?.city ?? '—'} · {org.serviceRadiusKm} km radius
          </KV>
          <KV label="Handles">{org.specializations?.join(', ') || '—'}</KV>
          <KV label="Registered">{timeAgo(org.createdAt)}</KV>
          {owner && (
            <>
              <KV label="Login account">{owner.email}</KV>
              <KV label="Last signed in">
                {owner.lastLoginAt ? timeAgo(owner.lastLoginAt) : 'never'}
              </KV>
            </>
          )}
        </dl>
        {org.reviewNote && (
          <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            Review note: {org.reviewNote}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Recent cases
        </h2>
        {recentCases.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            They have not taken on any cases yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentCases.map((r) => {
              const u = urgencyMeta(r.effectiveUrgency);
              return (
                <li key={r.id} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3">
                  {r.primaryMedia?.thumbnailUrl && (
                    <img
                      src={r.primaryMedia.thumbnailUrl}
                      alt=""
                      className="size-16 shrink-0 rounded-lg bg-stone-100 object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${u.chip}`}>
                        {u.label}
                      </span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      <span className="text-[11px] text-stone-400">{timeAgo(r.updatedAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-sm text-stone-700">{reportText(r).text}</p>
                  </div>
                  <Link
                    to={`/reports/${r.id}`}
                    className="self-center text-xs font-semibold text-stone-600 hover:underline"
                  >
                    View
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Badge({ tone, children }) {
  const cls = {
    green: 'bg-green-100 text-green-800',
    sky: 'bg-sky-100 text-sky-800',
    amber: 'bg-amber-100 text-amber-800',
    stone: 'bg-stone-100 text-stone-700',
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function Metric({ label, value, sub, big, tone }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'
      }`}
    >
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-1 font-bold text-stone-900 ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

function KV({ label, children }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-800">{children}</dd>
    </div>
  );
}
