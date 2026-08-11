import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const PUBLIC_TABS = [
  { to: '/report', label: 'Report a Dog' },
  { to: '/find', label: 'Find a Dog' },
  { to: '/adopt', label: 'Adopt' },
  { to: '/donate', label: 'Donate' },
];

function tabClass({ isActive }) {
  return [
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  ].join(' ');
}

export default function Layout() {
  const { user, isAuthenticated, isAdmin, isRescuer, organization, logout } = useAuth();
  const navigate = useNavigate();

  /**
   * The public nav stays public. Rescuer and admin work happen in their own
   * consoles, reached by the button on the right rather than mixed in as another
   * tab beside "Adopt" and "Donate".
   */
  const tabs = PUBLIC_TABS;
  const workspace = isAdmin
    ? { to: '/admin', label: 'Admin console' }
    : isRescuer
      ? { to: '/rescuer', label: 'My workspace' }
      : null;

  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/') });

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        {/* Two rows below lg. Letting a single flex row wrap put one tab on its
            own line at ~800px, which looked broken. */}
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight">
              <span aria-hidden="true">🐕</span>
              <span>StreetPaws</span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {tabs.map((tab) => (
                <NavLink key={tab.to} to={tab.to} className={tabClass}>
                  {tab.label}
                </NavLink>
              ))}
            </nav>

            {/* Never hide these behind a breakpoint. When they were sm:-only,
                a narrow window had no visible way to sign in or out at all,
                which reads as "there is no login". */}
            <div className="flex shrink-0 items-center gap-2">
              {isAuthenticated ? (
                <div className="flex items-center gap-2">
                  {workspace && (
                    <Link
                      to={workspace.to}
                      className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 sm:px-3"
                    >
                      {workspace.label} →
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={signOut}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 sm:px-3"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="rounded-lg px-2 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:px-3"
                >
                  Sign in
                </Link>
              )}

              <Link
                to="/report"
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 sm:px-4"
              >
                <span className="hidden sm:inline">Report an injured dog</span>
                <span className="sm:hidden">Report</span>
              </Link>
            </div>
          </div>

          {/* Scrolls sideways on a narrow phone rather than wrapping. */}
          <nav className="-mx-1 mt-2 flex items-center gap-1 overflow-x-auto lg:hidden">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `shrink-0 ${tabClass({ isActive })}`}>
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-stone-500">
          StreetPaws connects people who find street dogs in distress with nearby NGOs and
          independent rescuers.
        </div>
      </footer>
    </div>
  );
}
