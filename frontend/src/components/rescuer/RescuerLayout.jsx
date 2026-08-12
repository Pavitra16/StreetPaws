import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import PawMark from '../common/PawMark';

/**
 * The rescuer workspace gets its own shell, for the same reason the admin
 * console does: someone triaging injured dogs is doing a job, not browsing the
 * site. Putting "Report a Dog / Adopt / Donate" above their case queue makes a
 * working tool look like another page of the website.
 *
 * The public site stays reachable through one clearly-marked link out.
 */
const SECTIONS = [
  { to: '/rescuer', end: true, label: 'Cases', icon: '🚑', badge: 'pending' },
  { to: '/rescuer/listings', label: 'Dogs for adoption', icon: '🏠', badge: 'listings' },
  { to: '/rescuer/enquiries', label: 'Enquiries', icon: '✉️', badge: 'enquiries' },
];

export default function RescuerLayout() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const orgId = user?.organizationId ?? organization?.id;

  const { data: queue } = useQuery({
    queryKey: ['org-queue', orgId],
    queryFn: async () => (await api.get(`/organizations/${orgId}/queue`)).data,
    enabled: Boolean(orgId),
    refetchInterval: 15000,
  });

  const { data: enquiries } = useQuery({
    queryKey: ['adoption-applications', orgId],
    queryFn: async () => (await api.get('/adoptions/applications')).data,
    enabled: Boolean(orgId),
  });

  const { data: listings } = useQuery({
    queryKey: ['my-listings', orgId],
    queryFn: async () => (await api.get('/adoptions/mine')).data,
    enabled: Boolean(orgId),
  });

  const badges = {
    pending: queue?.counts?.pending ?? 0,
    enquiries: enquiries?.results?.filter((e) => e.status === 'submitted').length ?? 0,
    listings: listings?.counts?.available ?? 0,
  };

  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/login') });

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <header className="sticky top-0 z-20 border-b border-brand-800 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          {/* Which organisation you are signed in as matters more on a phone,
              not less — a volunteer may hold accounts for more than one. The
              wordmark drops below sm to make room for it rather than the other
              way round. */}
          <div className="flex min-w-0 items-center gap-2">
            <PawMark className="size-6 text-white" />
            <span className="hidden font-semibold tracking-tight sm:block">StreetPaws</span>
            {/* Not uppercased. Organisation names here are real and long —
                "Sanjay Gandhi Animal Care Centre" in capitals is a wall of
                letters, and it mangled the casing of names like "demoNGO". */}
            <span className="min-w-0 truncate rounded bg-brand-800 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-brand-100">
              {organization?.name ?? 'Rescuer'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to="/"
              title="View public site"
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-100 hover:bg-brand-800 hover:text-white"
            >
              <span className="hidden sm:inline">View public site ↗</span>
              <span className="sm:hidden" aria-hidden="true">↗</span>
              <span className="sr-only sm:hidden">View public site</span>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-brand-600 px-2 py-1.5 text-xs font-medium text-brand-50 hover:bg-brand-800 sm:px-3"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {organization && !organization.verified && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          Your organisation is <strong>not yet verified</strong>, so reporter phone numbers stay
          hidden. You can still accept and work cases.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row">
        <nav className="flex gap-1 overflow-x-auto lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                [
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-900 text-white'
                    : 'text-stone-600 hover:bg-stone-200 hover:text-stone-900',
                ].join(' ')
              }
            >
              <span aria-hidden="true">{s.icon}</span>
              <span className="flex-1">{s.label}</span>
              {badges[s.badge] > 0 && (
                <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
                  {badges[s.badge]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <Outlet context={{ orgId, organization, queue, enquiries, listings }} />
        </main>
      </div>
    </div>
  );
}
