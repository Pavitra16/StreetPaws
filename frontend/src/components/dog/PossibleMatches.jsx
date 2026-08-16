import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import MatchResultCard from '../ai/MatchResultCard';
import Spinner from '../common/Spinner';

/**
 * Found reports that might be this lost dog.
 *
 * The matching engine already existed and this page never called it, so an owner
 * had to notice the "search by photo" tab, re-upload a photo of the dog they had
 * just posted, and re-enter where it went missing — to run a comparison the
 * server could do from the report id alone.
 */
export default function PossibleMatches({ report }) {
  const name = report.dogName ?? 'this dog';

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['matches', report.id],
    queryFn: async () =>
      (await api.post('/search/match', { reportId: report.id, kind: 'found', limit: 6 })).data,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">Dogs found nearby that might be {name}</h2>

      {isPending && <Spinner label="Comparing against found reports…" />}

      {isError && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">
          Could not run the comparison: {error.message}
        </p>
      )}

      {data && data.results.length === 0 && (
        /**
         * Nothing found is the common case, especially early on, and it must not
         * read as a broken feature — it is a real answer, and the reassuring part
         * is that the comparison re-runs as new dogs are reported.
         */
        <p className="mt-2 text-sm text-stone-500">
          No found dogs match {name} yet. This runs again each time you open the page, so it is
          worth checking back — and{' '}
          <span className="text-stone-700">sharing the report widens who is looking</span>.
        </p>
      )}

      {data && data.results.length > 0 && (
        <>
          <p className="mt-1 text-xs text-stone-500">
            Ranked by appearance, breed and markings, distance and timing. A high score is a lead
            worth following, not a confirmation — look at the photos yourself.
          </p>
          <div className="mt-4 space-y-3">
            {data.results.map((r, i) => (
              <MatchResultCard key={r.id} result={r} rank={i + 1} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
