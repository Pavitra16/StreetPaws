import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';
import { timeAgo } from '../../lib/urgency';

const TABS = [
  { id: 'pending', label: 'Awaiting review' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
];

export default function AdminApplications() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [issued, setIssued] = useState(null);

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'orgs', tab],
    queryFn: async () => (await api.get('/admin/organizations', { params: { status: tab } })).data,
  });

  const review = useMutation({
    mutationFn: async ({ id, ...body }) =>
      (await api.post(`/admin/organizations/${id}/review`, body)).data,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      if (res.credentials) {
        setIssued({ ...res.credentials, emailed: res.emailed, emailReason: res.emailReason });
      }
    },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-stone-500">
          Approving creates their login and lets them start receiving reports.
        </p>
      </header>

      {issued && (
        <div
          className={`rounded-xl border p-4 ${
            issued.emailed ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
          }`}
        >
          <h2 className={`text-sm font-semibold ${issued.emailed ? 'text-green-900' : 'text-amber-900'}`}>
            {issued.emailed
              ? 'Account created — credentials emailed'
              : 'Account created — you must send these yourself'}
          </h2>

          {/* States plainly whether the email went out. Saying "also emailed if
              configured" left the admin to guess, and a rescuer waiting on an
              email that was never sent simply never signs in. */}
          <p className={`mt-1 text-sm ${issued.emailed ? 'text-green-900' : 'text-amber-900'}`}>
            {issued.emailed ? (
              <>Sent to {issued.email}. Shown here once and never stored.</>
            ) : (
              <>
                <strong>No email was sent</strong>
                {issued.emailReason === 'smtp_not_configured'
                  ? ' — email is not configured on this server.'
                  : ` — ${issued.emailReason}`}{' '}
                Copy the password below and send it to them. It is not stored anywhere and cannot be
                recovered.
              </>
            )}
          </p>

          <dl
            className={`mt-3 space-y-1 rounded-lg p-3 font-mono text-sm ${
              issued.emailed ? 'bg-green-100 text-green-950' : 'bg-amber-100 text-amber-950'
            }`}
          >
            <div>Email: {issued.email}</div>
            <div>Temporary password: {issued.tempPassword}</div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(
                  `Email: ${issued.email}\nTemporary password: ${issued.tempPassword}\nSign in at ${window.location.origin}/login`
                )
              }
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
            >
              Copy credentials
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                issued.emailed
                  ? 'border-green-400 text-green-900 hover:bg-green-100'
                  : 'border-amber-400 text-amber-900 hover:bg-amber-100'
              }`}
            >
              I have sent these
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.id
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800',
            ].join(' ')}
          >
            {t.label}
            {t.id === 'pending' && data?.counts?.pending ? ` (${data.counts.pending})` : ''}
          </button>
        ))}
      </div>

      {isPending && <Spinner label="Loading…" />}

      {data?.results?.length === 0 && (
        <EmptyState
          icon="📋"
          title={tab === 'pending' ? 'Nothing awaiting review' : 'Nothing here'}
          description={tab === 'pending' ? 'New applications will appear here.' : undefined}
        />
      )}

      <ul className="space-y-3">
        {data?.results?.map((org) => (
          <ApplicationRow
            key={org.id}
            org={org}
            busy={review.isPending}
            onReview={(body) => review.mutate({ id: org.id, ...body })}
          />
        ))}
      </ul>

      {review.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{review.error.message}</p>
      )}
    </div>
  );
}

function ApplicationRow({ org, onReview, busy }) {
  const [verified, setVerified] = useState(true);
  const [note, setNote] = useState('');
  const isPending = org.applicationStatus === 'pending';

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/admin/organizations/${org.id}`} className="font-semibold hover:underline">
          {org.name}
        </Link>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
          {org.kind === 'ngo' ? 'NGO' : 'Independent rescuer'}
        </span>
        <span className="text-xs text-stone-400">applied {timeAgo(org.createdAt)}</span>
      </div>

      {org.description && <p className="mt-1.5 text-sm text-stone-600">{org.description}</p>}

      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-stone-500 sm:grid-cols-2">
        <Row label="Contact">{org.contactPersonName ?? '—'}</Row>
        <Row label="Email">{org.email}</Row>
        <Row label="Phone">{org.phone}</Row>
        <Row label="PAN">{org.pan ?? '—'}</Row>
        <Row label="Registration no.">{org.registrationNumber ?? '—'}</Row>
        <Row label="Darpan ID">{org.darpanId ?? '—'}</Row>
        <Row label="Years active">{org.yearsActive ?? '—'}</Row>
        <Row label="Area">
          {org.location?.city ?? '—'} · {org.serviceRadiusKm}km
        </Row>
        <Row label="Capacity">{org.capacity} cases</Row>
        <Row label="Handles">{org.specializations?.join(', ') || '—'}</Row>
      </dl>

      {org.reviewNote && (
        <p className="mt-2 rounded-lg bg-stone-50 p-2 text-xs text-stone-600">
          Review note: {org.reviewNote}
        </p>
      )}

      {isPending && (
        <div className="mt-4 space-y-3 border-t border-stone-100 pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Mark verified</span>
              <span className="block text-xs text-stone-500">
                Lets them see reporter phone numbers. Untick to let them work cases without access
                to personal data.
              </span>
            </span>
          </label>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — included in the rejection email"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview({ decision: 'reject', note })}
              className="rounded-lg border border-stone-300 px-4 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview({ decision: 'approve', verified, note })}
              className="rounded-lg bg-green-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve &amp; create account
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-stone-700">{children}</dd>
    </div>
  );
}
