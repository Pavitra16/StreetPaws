import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Where to send someone after signing in.
 *
 * `from` is remembered when a guard bounces you to the login page — but it
 * survives a sign-out, so signing back in as a different role could send a
 * rescuer to /admin and straight into a "not available" wall. Only honour it if
 * the role that just signed in can actually open it.
 */
function landingFor(role, from) {
  const home = role === 'admin' ? '/admin' : '/rescuer';
  if (!from) return home;

  const adminOnly = from.startsWith('/admin');
  const rescuerOnly = from.startsWith('/rescuer');
  if (adminOnly && role !== 'admin') return home;
  if (rescuerOnly && role === 'admin') return home;

  return from;
}

export default function Login() {
  const { login, isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });

  if (isLoading) return null;
  if (isAuthenticated) {
    return <Navigate to={landingFor(isAdmin ? 'admin' : 'ngo', location.state?.from)} replace />;
  }

  const submit = (e) => {
    e.preventDefault();
    login.mutate(form, {
      onSuccess: (data) => {
        if (data.mustChangePassword) return navigate('/account/password', { replace: true });
        navigate(landingFor(data.user.role, location.state?.from), { replace: true });
      },
    });
  };

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-stone-500">
        For registered NGOs, rescuers and administrators.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-stone-700">Password</span>
            <Link to="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">
              Forgot password?
            </Link>
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {login.isError && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{login.error.message}</p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500">
        Not registered yet?{' '}
        <Link to="/organizations/apply" className="font-semibold text-brand-700 hover:underline">
          Apply as an NGO or rescuer
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-stone-400">
        Reporting a dog never needs an account.
      </p>
    </div>
  );
}
