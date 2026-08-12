import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import PawMark from '../common/PawMark';

/**
 * The admin panel gets its own shell.
 *
 * It deliberately does NOT reuse the public header: an administrator reviewing
 * applications is doing a different job from a member of the public reporting a
 * dog, and mixing "Report a Dog / Adopt / Donate" into the same bar makes the
 * console feel like a page of the website rather than a tool.
 */
const SECTIONS = [
  { to: '/admin', end: true, label: 'Overview', icon: '▦' },
  { to: '/admin/applications', label: 'Applications', icon: '📋', badge: 'pending' },
  { to: '/admin/ngos', label: 'NGOs', icon: '🏥', badge: 'ngo' },
  { to: '/admin/rescuers', label: 'Rescuers', icon: '🧑', badge: 'helper' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
    refetchInterval: 30000,
  });

  const badges = {
    pending: stats?.organizations?.pending ?? 0,
    ngo: stats?.approvedByKind?.ngo ?? 0,
    helper: stats?.approvedByKind?.private_helper ?? 0,
  };

  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/login') });

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <header className="sticky top-0 z-20 border-b border-stone-800 bg-stone-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <PawMark className="size-6 text-brand-300" />
            <span className="hidden font-semibold tracking-tight sm:block">StreetPaws</span>
            <span className="shrink-0 rounded bg-stone-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-200">
              Admin
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <span className="hidden text-xs text-stone-400 lg:block">{user?.email}</span>
            {/* One way back to the public site, clearly marked as leaving the console. */}
            <Link
              to="/"
              title="View public site"
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-white"
            >
              <span className="hidden sm:inline">View public site ↗</span>
              <span className="sm:hidden" aria-hidden="true">↗</span>
              <span className="sr-only sm:hidden">View public site</span>
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

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
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-200 hover:text-stone-900',
                ].join(' ')
              }
            >
              <span aria-hidden="true">{s.icon}</span>
              <span className="flex-1">{s.label}</span>
              {s.badge && badges[s.badge] > 0 && (
                <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
                  {badges[s.badge]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <Outlet context={{ stats }} />
        </main>
      </div>
    </div>
  );
}
