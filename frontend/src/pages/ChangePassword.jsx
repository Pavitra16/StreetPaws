import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function ChangePassword() {
  const { changePassword, mustChangePassword, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [localError, setLocalError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setLocalError(null);
    if (form.newPassword !== form.confirm) {
      setLocalError('The two passwords do not match');
      return;
    }
    changePassword.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      { onSuccess: () => navigate(isAdmin ? '/admin' : '/rescuer', { replace: true }) }
    );
  };

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {mustChangePassword ? 'Choose a password' : 'Change your password'}
      </h1>
      {mustChangePassword && (
        <p className="mt-1 text-sm text-stone-500">
          Your account was created with a temporary password. Pick your own before continuing.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <Field label={mustChangePassword ? 'Temporary password' : 'Current password'}>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={form.currentPassword}
            onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            className={inputCls}
          />
        </Field>

        <Field label="New password" hint="At least 10 characters, with a letter and a number.">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.newPassword}
            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            className={inputCls}
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            className={inputCls}
          />
        </Field>

        {(localError || changePassword.isError) && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {localError ??
              changePassword.error.details?.newPassword ??
              changePassword.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={changePassword.isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {changePassword.isPending ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
