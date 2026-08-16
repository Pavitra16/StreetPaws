import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import MapPicker from '../map/MapPicker';

/**
 * "I saw this dog."
 *
 * Kept to one screen with one required field — the pin. The person filling this
 * in is standing on a pavement having just watched a dog walk away; anything
 * that looks like the four-step report form loses them, and a pin on its own is
 * already worth having.
 */
export default function SightingForm({ report, onDone }) {
  const qc = useQueryClient();
  const [point, setPoint] = useState(
    report.lat != null ? { lat: report.lat, lng: report.lng } : null
  );
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        lat: point.lat,
        lng: point.lng,
        address: point.address,
        city: point.city,
        note: note.trim() || undefined,
        ...(name.trim() || phone.trim()
          ? { contact: { name: name.trim() || undefined, phone: phone.trim() || undefined } }
          : {}),
      };
      return (await api.post(`/reports/${report.id}/sightings`, payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sightings', report.id] });
      onDone?.();
    },
  });

  const name_ = report.dogName ?? 'the dog';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Where did you see {name_}?</h3>
        <p className="mt-1 text-xs text-stone-500">
          Drag the pin to the spot. This is the only thing we need — everything below is optional.
        </p>
      </div>

      <MapPicker position={point} onChange={setPoint} height={280} />

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">
          Anything else <span className="font-normal text-stone-400">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Which direction it went, whether it looked hurt, if it had a collar…"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Your name <span className="font-normal text-stone-400">(optional)</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">
            Phone <span className="font-normal text-stone-400">(optional)</span>
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
        Your number is never shown on the page. It is passed to the owner only so they can ask you
        where exactly you saw {name_}.
      </p>

      {mutation.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!point || mutation.isPending}
          className="rounded-lg bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Sending…' : 'Send sighting'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
