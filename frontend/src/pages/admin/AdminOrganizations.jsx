import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { api } from '../../lib/api';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';

/**
 * The approved-organisation directory, filtered to one kind.
 * `kind` comes from the route, so /admin/ngos and /admin/rescuers are the same
 * screen with a different filter rather than two copies of it.
 */
export default function AdminOrganizations({ kind, title, blurb }) {
  const [search, setSearch] = useState('');

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'orgs', 'approved', kind, search],
    queryFn: async () =>
      (
        await api.get('/admin/organizations', {
          params: { status: 'approved', kind, ...(search.trim() ? { search: search.trim() } : {}) },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {title}
            {results.length > 0 && (
              <span className="ml-2 text-lg font-medium text-stone-400">{results.length}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{blurb}</p>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or city…"
          className="w-64 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
      </header>

      {isPending && <Spinner label="Loading…" />}

      {!isPending && results.length === 0 && (
        <EmptyState
          icon="🔍"
          title={search ? 'Nothing matches that search' : `No approved ${title.toLowerCase()} yet`}
          description={search ? undefined : 'Approve an application to add one.'}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Area</th>
              <th className="px-4 py-2 text-right font-medium">Load</th>
              <th className="px-4 py-2 text-right font-medium">Helped</th>
              <th className="px-4 py-2 text-right font-medium">Response</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {results.map((org) => {
              const stats = org.responseStats ?? {};
              // Clamped: responseStats is a denormalised cache and can drift
              // above 100% if it is ever written out of step with the Alert
              // rows. Showing "533% acceptance" would just look broken.
              const rate = stats.assigned
                ? Math.min(1, (stats.accepted ?? 0) / stats.assigned)
                : null;
              return (
                <tr key={org.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/organizations/${org.id}`}
                      className="font-medium text-stone-900 hover:underline"
                    >
                      {org.name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500">
                      {org.verified ? (
                        <span className="text-sky-700">verified</span>
                      ) : (
                        <span className="text-amber-700">unverified</span>
                      )}
                      <span>·</span>
                      <span>{org.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {org.location?.city ?? '—'}
                    <div className="text-xs text-stone-400">{org.serviceRadiusKm} km radius</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-700">
                    {org.activeCaseCount}/{org.capacity}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-stone-900">
                    {stats.resolved ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-600">
                    {rate == null ? '—' : `${Math.round(rate * 100)}%`}
                    <div className="text-xs text-stone-400">
                      {stats.avgResponseMinutes != null ? `${stats.avgResponseMinutes} min` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/organizations/${org.id}`}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
