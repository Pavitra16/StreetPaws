import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { timeAgo } from '../../lib/urgency';
import SightingForm from './SightingForm';

/**
 * The sighting trail.
 *
 * A lost dog moves, so a single "last seen" pin goes stale within hours. Each
 * sighting narrows where to look next, which is why they are listed newest first
 * with the distance from the original report — the useful reading is the drift.
 */
export default function SightingsPanel({ report, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const name = report.dogName ?? 'this dog';

  const { data } = useQuery({
    queryKey: ['sightings', report.id],
    queryFn: async () => (await api.get(`/reports/${report.id}/sightings`)).data,
  });

  const sightings = data?.results ?? [];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Sightings</h2>
          <p className="mt-1 text-xs text-stone-500">
            {sightings.length === 0
              ? `Nobody has reported seeing ${name} yet.`
              : `${sightings.length} ${sightings.length === 1 ? 'person has' : 'people have'} reported seeing ${name}.`}
          </p>
        </div>
        {!open && !readOnly && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            I've seen {name}
          </button>
        )}
      </div>

      {open && !readOnly && (
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50/60 p-4">
          <SightingForm report={report} onDone={() => setOpen(false)} />
        </div>
      )}

      {sightings.length > 0 && (
        <ol className="mt-4 space-y-3">
          {sightings.map((s) => (
            <li key={s.id} className="border-l-2 border-sky-200 pl-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-stone-800">
                  {s.location?.address ?? s.location?.city ?? 'Location on the map'}
                </span>
                {s.distanceKm != null && (
                  <span className="text-xs text-stone-500">
                    {s.distanceKm} km from where {name} went missing
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Seen {timeAgo(s.seenAt)}
                {s.contact?.name ? ` · reported by ${s.contact.name}` : ''}
              </p>
              {s.note && <p className="mt-1 text-sm text-stone-700">{s.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
