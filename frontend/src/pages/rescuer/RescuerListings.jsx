import { Link, useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { timeAgo } from '../../lib/urgency';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';

const STATUS = {
  available: { label: 'Available', cls: 'bg-green-100 text-green-800' },
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  adopted: { label: 'Adopted', cls: 'bg-sky-100 text-sky-800' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-stone-200 text-stone-700' },
};

export default function RescuerListings() {
  const { orgId, listings } = useOutletContext();
  const queryClient = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/adoptions/${id}`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-listings', orgId] }),
  });

  if (!listings) return <Spinner label="Loading your listings…" />;

  const items = listings.results ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dogs for adoption</h1>
          <p className="mt-1 text-sm text-stone-500">
            Dogs you have listed. Only <strong>available</strong> ones appear publicly.
          </p>
        </div>
        <Link
          to="/rescuer/listings/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + List a dog
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon="🏠"
          title="You have not listed any dogs yet"
          description="Once a dog you rescued has recovered, list them here to find a home."
          action={
            <Link
              to="/rescuer/listings/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              List a dog
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((dog) => {
            const s = STATUS[dog.status] ?? STATUS.available;
            return (
              <li key={dog.id} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3">
                {dog.primaryMedia?.thumbnailUrl || dog.primaryMedia?.url ? (
                  <img
                    src={dog.primaryMedia.thumbnailUrl ?? dog.primaryMedia.url}
                    alt=""
                    className="size-20 shrink-0 rounded-lg bg-stone-100 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid size-20 shrink-0 place-items-center rounded-lg bg-stone-100 text-2xl">🐕</div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/adopt/${dog.id}`} className="font-semibold hover:underline">
                      {dog.name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[dog.breed, dog.size, dog.sex !== 'unknown' ? dog.sex : null].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">listed {timeAgo(dog.createdAt)}</p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dog.status === 'available' && (
                      <button
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: dog.id, status: 'withdrawn' })}
                        className="rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-medium hover:bg-stone-50 disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    )}
                    {(dog.status === 'withdrawn' || dog.status === 'pending') && (
                      <button
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: dog.id, status: 'available' })}
                        className="rounded-lg border border-stone-300 px-2.5 py-1 text-[11px] font-medium hover:bg-stone-50 disabled:opacity-50"
                      >
                        Publish again
                      </button>
                    )}
                    {dog.status !== 'adopted' && (
                      <button
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: dog.id, status: 'adopted' })}
                        className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        Mark adopted
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {setStatus.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{setStatus.error.message}</p>
      )}
    </div>
  );
}
