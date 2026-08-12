import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useGeolocation, DEFAULT_CENTER } from '../hooks/useGeolocation';
import ReportsMap from '../components/map/ReportsMap';
import DogCard from '../components/dog/DogCard';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import PhotoMatchPanel from '../components/ai/PhotoMatchPanel';
import { BreedDatalist, BREED_LIST_ID } from '../lib/breeds.jsx';

const TABS = [
  { id: 'location', label: 'By location' },
  { id: 'breed', label: 'By breed' },
  { id: 'photo', label: 'By photo' },
];

// Must contain DEFAULT_RADIUS_KM — a <select> whose value is absent from its
// options silently displays the first one, so the label would disagree with the
// radius actually being searched.
const RADIUS_OPTIONS = [2, 5, 10, 15, 25, 50];
const DEFAULT_RADIUS_KM = 15;

export default function FindDog() {
  const [tab, setTab] = useState('location');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [kind, setKind] = useState('found');
  const [condition, setCondition] = useState('');
  const [breed, setBreed] = useState('');
  const [breedInput, setBreedInput] = useState('');
  const [sort, setSort] = useState('distance');
  const [selectedId, setSelectedId] = useState(null);

  const { position, status: geoStatus, error: geoError, locate } = useGeolocation();

  // Ask for location once on mount; the map still works if the user says no.
  useEffect(() => {
    locate();
  }, [locate]);

  useEffect(() => {
    if (position) setCenter({ lat: position.lat, lng: position.lng });
  }, [position]);

  // Debounce the breed box so we aren't firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setBreed(breedInput.trim()), 350);
    return () => clearTimeout(t);
  }, [breedInput]);

  const params = {
    lat: center.lat,
    lng: center.lng,
    radiusKm,
    sort,
    limit: 60,
    ...(kind ? { kind } : {}),
    ...(condition ? { condition } : {}),
    ...(tab === 'breed' && breed ? { breed } : {}),
  };

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['search-near', params],
    queryFn: async () => (await api.get('/search/near', { params })).data,
    placeholderData: keepPreviousData,
    enabled: tab !== 'photo',
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Find a dog</h1>
        <p className="mt-1 text-sm text-stone-500">
          Search dogs reported nearby, or look for one you have lost.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'photo' ? (
        <PhotoMatchPanel center={center} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
            {tab === 'breed' && (
              <label className="flex-1 min-w-48 text-sm">
                <span className="mb-1 block font-medium text-stone-700">Breed</span>
                <input
                  value={breedInput}
                  onChange={(e) => setBreedInput(e.target.value)}
                  list={BREED_LIST_ID}
                  placeholder="Labrador, Indian Pariah, Beagle…"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <BreedDatalist />
              </label>
            )}

            <label className="text-sm">
              <span className="mb-1 block font-medium text-stone-700">Showing</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500"
              >
                <option value="found">Dogs found on the street</option>
                <option value="lost">Dogs reported lost</option>
                <option value="">Both</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-stone-700">Within</span>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-stone-700">Condition</span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500"
              >
                <option value="">Any</option>
                <option value="critical">Critical</option>
                <option value="injured">Injured</option>
                <option value="sick">Sick</option>
                <option value="healthy">Healthy</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-stone-700">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500"
              >
                <option value="distance">Nearest first</option>
                <option value="urgency">Most urgent first</option>
                <option value="recent">Most recent first</option>
              </select>
            </label>

            <button
              type="button"
              onClick={locate}
              disabled={geoStatus === 'locating'}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {geoStatus === 'locating' ? 'Locating…' : '📍 Use my location'}
            </button>
          </div>

          {geoError && <p className="text-sm text-amber-700">{geoError}</p>}

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <ReportsMap
              center={center}
              radiusKm={radiusKm}
              reports={results}
              selectedId={selectedId}
              onSelect={setSelectedId}
              height={520}
            />

            <div className="flex max-h-[520px] flex-col">
              <p className="mb-2 text-sm text-stone-500">
                {isPending ? 'Searching…' : `${data?.total ?? 0} result${data?.total === 1 ? '' : 's'}`}
                {isFetching && !isPending && ' · updating'}
              </p>

              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {isPending && <Spinner label="Searching nearby…" />}

                {isError && (
                  <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error.message}</div>
                )}

                {!isPending && !isError && results.length === 0 && (
                  <EmptyState
                    icon="🔍"
                    title="Nothing found here"
                    description="Try a wider radius, or clear the condition filter."
                  />
                )}

                {results.map((r) => (
                  <DogCard
                    key={r.id}
                    report={r}
                    selected={r.id === selectedId}
                    onHover={setSelectedId}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
