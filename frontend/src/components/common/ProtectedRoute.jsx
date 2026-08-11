import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import Spinner from './Spinner';

const ROLE_LABEL = {
  admin: 'an administrator',
  ngo: 'an NGO',
  helper: 'an independent rescuer',
  reporter: 'a reporter',
};

/**
 * Gates a route on being signed in, and optionally on role.
 *
 * This is a UX guard, not a security boundary — every protected endpoint checks
 * the session server-side too. Hiding a page a user cannot use is courtesy;
 * the API refusing them is the actual protection.
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, isLoading, user, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner label="Checking your session…" />;

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // An admin-issued temporary password must be changed before anything else.
  if (mustChangePassword && location.pathname !== '/account/password') {
    return <Navigate to="/account/password" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'admin' ? '/admin' : '/rescuer';
    return (
      <div className="py-16 text-center">
        <div className="text-4xl" aria-hidden="true">🔒</div>
        <h1 className="mt-3 text-xl font-bold">Not available to your account</h1>
        <p className="mt-1 text-sm text-stone-500">
          You are signed in as {ROLE_LABEL[user.role] ?? user.role}.
        </p>
        <Link
          to={home}
          className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return children;
}
