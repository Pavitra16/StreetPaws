import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { useCloudinaryUpload } from '../../hooks/useCloudinaryUpload';
import MediaUploader from '../upload/MediaUploader';
import MatchResultCard from './MatchResultCard';
import Spinner from '../common/Spinner';
import EmptyState from '../common/EmptyState';

export default function PhotoMatchPanel({ center }) {
  const uploader = useCloudinaryUpload();
  const [breed, setBreed] = useState('');
  const [lostAt, setLostAt] = useState('');

  const uploaded = uploader.toMediaPayload()[0];

  const match = useMutation({
    mutationFn: async () => {
      const payload = {
        imageUrl: uploaded.url,
        kind: 'found',
        limit: 12,
        ...(center ? { lat: center.lat, lng: center.lng } : {}),
        ...(breed.trim() ? { breed: breed.trim() } : {}),
        ...(lostAt ? { lostAt } : {}),
      };
      return (await api.post('/search/match', payload)).data;
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">Upload a photo of your dog</h2>
        <p className="mt-1 text-sm text-stone-500">
          We compare it against every dog reported found nearby — by appearance, breed and
          markings, how close it was found, and when.
        </p>

        <div className="mt-4">
          <MediaUploader uploader={uploader} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              Breed <span className="font-normal text-stone-400">(optional)</span>
            </span>
            <input
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="Labrador, Indian Pariah…"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">
              When did it go missing? <span className="font-normal text-stone-400">(optional)</span>
            </span>
            <input
              type="date"
              value={lostAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setLostAt(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => match.mutate()}
          disabled={!uploaded || uploader.isUploading || match.isPending}
          className="mt-4 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {match.isPending ? 'Searching…' : 'Find matches'}
        </button>
      </div>

      {match.isPending && <Spinner label="Comparing against reported dogs…" />}

      {match.isError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{match.error.message}</div>
      )}

      {match.isSuccess && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              {match.data.results.length} possible match
              {match.data.results.length === 1 ? '' : 'es'}
            </h3>
            <p className="text-xs text-stone-400">
              {match.data.meta.candidatesConsidered} reports compared ·{' '}
              {match.data.meta.retrieval === 'atlas_vector_search'
                ? 'vector search'
                : 'full scan'}
            </p>
          </div>

          {match.data.results.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No dogs reported found in this area yet"
              description="Try again in a day or two, and consider filing a lost-dog report so rescuers can contact you."
            />
          ) : (
            <>
              {match.data.results.map((r, i) => (
                <MatchResultCard key={r.id} result={r} rank={i + 1} />
              ))}
              <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
                These are ranked guesses, ordered by similarity — not identifications. Street dogs
                of the same breed look very alike, so check each photo yourself before contacting
                anyone.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
