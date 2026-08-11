import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [localError, setLocalError] = useState(null);

  const reset = useMutation({
    mutationFn: async () => (await api.post('/auth/reset-password', { token, newPassword: form.newPassword })).data,
  });

  if (!token) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="text-4xl" aria-hidden="true">🔗</div>
        <h1 className="mt-4 text-xl font-bold">This link is incomplete</h1>
        <p className="mt-2 text-sm text-stone-600">
          Open the link from your email exactly as it was sent — some mail apps break long links
          across lines.
        </p>
        <Link
          to="/forgot-password"
          className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <div className="text-4xl" aria-hidden="true">✅</div>
        <h1 className="mt-4 text-xl font-bold">Password updated</h1>
        <p className="mt-2 text-sm text-stone-600">{reset.data.message}</p>
        {/* Deliberately not signed in automatically: whoever asked for the reset
            may not be whoever opened the link. */}
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    setLocalError(null);
    if (form.newPassword !== form.confirm) {
      setLocalError('The two passwords do not match');
      return;
    }
    reset.mutate();
  };

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-stone-500">
        Signing this in will end any other sessions on this account.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.newPassword}
            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            className={inputCls}
          />
          <span className="mt-1 block text-xs text-stone-500">
            At least 10 characters, with a letter and a number.
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            className={inputCls}
          />
        </label>

        {(localError || reset.isError) && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {localError ?? reset.error.details?.newPassword ?? reset.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={reset.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {reset.isPending ? 'Saving…' : 'Set new password'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500">
        <Link to="/forgot-password" className="font-semibold text-brand-700 hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
