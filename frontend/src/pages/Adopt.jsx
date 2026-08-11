import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { api } from '../lib/api';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';

function ageLabel(months) {
  if (months == null) return null;
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? '' : 's'}`;
}

export default function Adopt() {
  const [filters, setFilters] = useState({ breed: '', size: '', sex: '', goodWithKids: false });

  const params = {
    limit: 40,
    ...(filters.breed.trim() ? { breed: filters.breed.trim() } : {}),
    ...(filters.size ? { size: filters.size } : {}),
    ...(filters.sex ? { sex: filters.sex } : {}),
    ...(filters.goodWithKids ? { goodWithKids: true } : {}),
  };

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['adoptions', params],
    queryFn: async () => (await api.get('/adoptions', { params })).data,
    placeholderData: keepPreviousData,
  });

  const set = (k) => (e) =>
    setFilters((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Adopt a dog</h1>
        <p className="mt-1 text-sm text-stone-500">
          Every dog here is listed by an NGO or rescuer we have approved. Enquiring is free and does
          not need an account.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="min-w-44 flex-1 text-sm">
          <span className="mb-1 block font-medium text-stone-700">Breed</span>
          <input
            value={filters.breed}
            onChange={set('breed')}
            placeholder="Indian Pariah, Labrador…"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-stone-700">Size</span>
          <select value={filters.size} onChange={set('size')} className="rounded-lg border border-stone-300 px-3 py-2">
            <option value="">Any</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-stone-700">Sex</span>
          <select value={filters.sex} onChange={set('sex')} className="rounded-lg border border-stone-300 px-3 py-2">
            <option value="">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>

        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" checked={filters.goodWithKids} onChange={set('goodWithKids')} />
          <span className="font-medium text-stone-700">Good with children</span>
        </label>
      </div>

      {isPending && <Spinner label="Loading dogs…" />}
      {isError && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error.message}</div>}

      {data?.results?.length === 0 && (
        <EmptyState
          icon="🏠"
          title="No dogs match this search"
          description="Try clearing a filter — new dogs are listed as rescuers take them in."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results?.map((dog) => (
          <Link
            key={dog.id}
            to={`/adopt/${dog.id}`}
            className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition-shadow hover:shadow-md"
          >
            <div className="aspect-4/3 bg-stone-100">
              {dog.primaryMedia?.thumbnailUrl || dog.primaryMedia?.url ? (
                <img
                  src={dog.primaryMedia.thumbnailUrl ?? dog.primaryMedia.url}
                  alt={dog.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid size-full place-items-center text-4xl">🐕</div>
              )}
            </div>

            <div className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold group-hover:text-brand-700">{dog.name}</h2>
                <span className="text-xs text-stone-400">{ageLabel(dog.ageMonths)}</span>
              </div>
              <p className="mt-0.5 text-sm text-stone-500">
                {[dog.breed, dog.size, dog.sex !== 'unknown' ? dog.sex : null].filter(Boolean).join(' · ')}
              </p>

              <div className="mt-2 flex flex-wrap gap-1">
                {dog.vaccinated && <Tag>Vaccinated</Tag>}
                {dog.sterilized && <Tag>Sterilised</Tag>}
                {dog.goodWith?.kids && <Tag>Good with kids</Tag>}
                {/* Temperament values are lowercase enums ("playful"), so only
                    these get capitalised — applying it to every tag turned
                    "Good with kids" into "Good With Kids". */}
                {dog.temperament?.slice(0, 2).map((t) => (
                  <Tag key={t} capitalize>
                    {t}
                  </Tag>
                ))}
              </div>

              <p className="mt-2 truncate text-xs text-stone-400">
                {dog.organizationId?.name}
                {dog.distanceKm != null ? ` · ${dog.distanceKm} km` : ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tag({ children, capitalize }) {
  return (
    <span
      className={`rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 ${
        capitalize ? 'first-letter:uppercase' : ''
      }`}
    >
      {children}
    </span>
  );
}
