import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');

  const request = useMutation({
    mutationFn: async () => (await api.post('/auth/forgot-password', { email })).data,
  });

  if (request.isSuccess) {
    return (
      <div className="mx-auto max-w-sm py-12 text-center">
        <div className="text-4xl" aria-hidden="true">📬</div>
        <h1 className="mt-4 text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-stone-600">{request.data.message}</p>
        <p className="mt-3 text-xs text-stone-500">
          The link works once and expires in an hour. Check spam if it has not arrived in a few
          minutes.
        </p>

        {/* Development only — the server returns this when SMTP is not set up,
            otherwise the link would be unreachable and untestable. */}
        {request.data.devLink && (
          <div className="mt-5 rounded-lg bg-amber-50 p-3 text-left">
            <p className="text-xs font-semibold text-amber-900">
              Development mode — email is not configured
            </p>
            <a
              href={request.data.devLink}
              className="mt-1 block break-all text-xs text-amber-800 underline"
            >
              {request.data.devLink}
            </a>
          </div>
        )}

        <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-sm text-stone-500">
        Enter the email your account uses and we will send a link to set a new password.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          request.mutate();
        }}
        className="mt-6 space-y-4 rounded-xl border border-stone-200 bg-white p-5"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {request.isError && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{request.error.message}</p>
        )}

        <button
          type="submit"
          disabled={request.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {request.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500">
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
