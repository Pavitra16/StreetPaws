import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { timeAgo } from '../../lib/urgency';
import Spinner from '../../components/common/Spinner';
import EmptyState from '../../components/common/EmptyState';

const STATUS = {
  submitted: { label: 'New', cls: 'bg-brand-100 text-brand-800' },
  reviewing: { label: 'Reviewing', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Declined', cls: 'bg-stone-200 text-stone-700' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-stone-200 text-stone-700' },
};

export default function RescuerEnquiries() {
  const { orgId, enquiries } = useOutletContext();
  const queryClient = useQueryClient();

  const review = useMutation({
    mutationFn: async ({ applicationId, status }) =>
      (await api.post(`/adoptions/applications/${applicationId}/review`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adoption-applications', orgId] });
      queryClient.invalidateQueries({ queryKey: ['my-listings', orgId] });
    },
  });

  if (!enquiries) return <Spinner label="Loading enquiries…" />;

  const items = enquiries.results ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Adoption enquiries</h1>
        <p className="mt-1 text-sm text-stone-500">
          People who want to adopt one of your dogs. Contact them directly.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon="✉️"
          title="No enquiries yet"
          description="When someone enquires about a dog you have listed, it appears here."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <EnquiryRow
              key={e.id}
              enquiry={e}
              busy={review.isPending}
              onReview={(status) => review.mutate({ applicationId: e.id, status })}
            />
          ))}
        </ul>
      )}

      {review.isError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{review.error.message}</p>
      )}
    </div>
  );
}

function EnquiryRow({ enquiry, onReview, busy }) {
  const s = STATUS[enquiry.status] ?? STATUS.submitted;
  const open = enquiry.status === 'submitted' || enquiry.status === 'reviewing';

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{enquiry.applicant?.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
        <span className="text-xs text-stone-400">
          wants {enquiry.listingId?.name ?? 'a dog'} · {timeAgo(enquiry.createdAt)}
        </span>
      </div>

      <p className="mt-1 text-sm text-stone-600">
        {[
          enquiry.city,
          enquiry.homeType?.replace('_', ' '),
          enquiry.hasChildren ? 'has children' : null,
          enquiry.hasOtherPets ? 'has other pets' : 'no other pets',
          enquiry.hasOutdoorSpace ? 'outdoor space' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {enquiry.reason && <p className="mt-1 text-sm text-stone-700">“{enquiry.reason}”</p>}
      {enquiry.experience && <p className="mt-1 text-xs text-stone-500">Experience: {enquiry.experience}</p>}

      <p className="mt-1.5 text-sm">
        <a href={`tel:${enquiry.applicant?.phone}`} className="font-mono text-brand-700 hover:underline">
          {enquiry.applicant?.phone}
        </a>
        {enquiry.applicant?.email && <span className="ml-2 text-stone-500">{enquiry.applicant.email}</span>}
      </p>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview('rejected')}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            Not a match
          </button>
          {enquiry.status === 'submitted' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview('reviewing')}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Mark as reviewing
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview('approved')}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Approve adopter
          </button>
          <span className="w-full text-[11px] text-stone-400">
            Approving marks {enquiry.listingId?.name ?? 'the dog'} as adopted and removes the listing.
          </span>
        </div>
      )}
    </li>
  );
}
