import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import Spinner from '../components/common/Spinner';
import { timeAgo } from '../lib/urgency';

/**
 * The owner's view of their own report, reached from the emailed manage link.
 *
 * No login, because filing a report never created an account. The token in the
 * URL is the whole authorisation — see reportAccessService.
 */
export default function ManageReport() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token');
  const qc = useQueryClient();

  const [confirming, setConfirming] = useState(null);
  const [description, setDescription] = useState(null);

  const { data: report, isPending, isError } = useQuery({
    queryKey: ['manage', id, token],
    queryFn: async () => (await api.get(`/reports/${id}/manage`, { params: { token } })).data,
    enabled: Boolean(token),
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (patch) =>
      (await api.patch(`/reports/${id}/manage`, { token, ...patch })).data,
    onSuccess: (data) => {
      qc.setQueryData(['manage', id, token], data);
      setDescription(null);
    },
  });

  const resolve = useMutation({
    mutationFn: async (status) =>
      (await api.post(`/reports/${id}/manage/resolve`, { token, status })).data,
    onSuccess: (data) => qc.setQueryData(['manage', id, token], data),
  });

  if (!token) {
    return (
      <Notice title="This link is incomplete">
        Open the manage link exactly as it appears in your email — the part after{' '}
        <code className="rounded bg-stone-100 px-1">?token=</code> is what identifies you.
      </Notice>
    );
  }

  if (isPending) return <Spinner label="Opening your report…" />;

  if (isError) {
    return (
      <Notice title="This link is no longer valid">
        A manage link stops working once the report is closed. If you closed it by mistake, or you
        need to change something, reply to the email we sent you and we will sort it out.
      </Notice>
    );
  }

  const name = report.dogName ?? 'your dog';
  const closed = report.canManage === false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Your report
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-stone-500">
          Reported {timeAgo(report.createdAt)} ·{' '}
          <Link to={`/reports/${id}`} className="text-brand-700 hover:underline">
            see the public page
          </Link>
        </p>
      </div>

      {params.get('new') && !closed && (
        /**
         * Shown once, straight after submitting. This page is the only way back
         * into the report, and the address bar is currently holding the only
         * copy the owner is guaranteed to have — say so before they close the tab.
         */
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
          <h2 className="font-semibold text-sky-950">{name}’s report is live</h2>
          <p className="mt-1 text-sm text-sky-900">
            People nearby can see it now, and we will email you whenever somebody reports a
            sighting.
          </p>
          <p className="mt-2 text-sm text-sky-900">
            <strong>Bookmark this page.</strong> It is how you close the report or change it later
            — there is no password to sign in with. We have emailed you the same link
            {report.contact?.email ? ` at ${report.contact.email}` : ''}.
          </p>
        </div>
      )}

      {closed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">
            {report.status === 'reunited' ? `${name} is home` : 'This report is closed'}
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            It no longer appears in searches, and this link has been retired.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Sightings</h2>
            <p className="mt-1 text-sm text-stone-600">
              {report.sightingCount === 0
                ? `Nobody has reported seeing ${name} yet. We will email you the moment somebody does.`
                : `${report.sightingCount} ${report.sightingCount === 1 ? 'person has' : 'people have'} reported seeing ${name}.`}
            </p>
            <Link
              to={`/reports/${id}`}
              className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
            >
              View them on the report →
            </Link>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Description</h2>
            <textarea
              value={description ?? report.description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => save.mutate({ description })}
              disabled={description === null || save.isPending}
              className="mt-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-40"
            >
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Your phone number</h2>
            <p className="mt-1 text-sm text-stone-600">
              {report.contact?.publishedByOwner
                ? `Shown on the report so anyone who spots ${name} can call you.`
                : 'Hidden from the public page. Only a verified rescuer can see it.'}
            </p>
            <button
              type="button"
              onClick={() => save.mutate({ showPublicly: !report.contact?.publishedByOwner })}
              disabled={save.isPending}
              className="mt-3 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40"
            >
              {report.contact?.publishedByOwner ? 'Hide my number' : 'Show my number'}
            </button>
          </section>

          {/* Closing is irreversible — it retires this link — so it is confirmed
              rather than a single tap, and kept visually apart from the edits. */}
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Close this report</h2>

            {!confirming ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming('reunited')}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {name} is home
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming('closed')}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Take the report down
                </button>
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-stone-50 p-4">
                <p className="text-sm text-stone-700">
                  {confirming === 'reunited'
                    ? `This removes ${name} from searches and retires your manage link. You will not be able to reopen it from this email.`
                    : 'This takes the report down and retires your manage link. You will not be able to reopen it from this email.'}
                </p>
                {resolve.isError && (
                  <p className="mt-2 text-sm text-red-700">{resolve.error.message}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolve.mutate(confirming)}
                    disabled={resolve.isPending}
                    className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
                  >
                    {resolve.isPending ? 'Closing…' : 'Yes, close it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {save.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{save.error.message}</p>
      )}
    </div>
  );
}

function Notice({ title, children }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-stone-500">{children}</p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
        ← Back to StreetPaws
      </Link>
    </div>
  );
}
