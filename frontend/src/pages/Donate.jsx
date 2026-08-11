import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useGeolocation, DEFAULT_CENTER } from '../hooks/useGeolocation';
import Spinner from '../components/common/Spinner';

const PRESETS = [200, 500, 1000, 2500];

/** Loads Razorpay's checkout script once, on demand. */
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Donate() {
  const { position } = useGeolocation();
  const center = position ?? DEFAULT_CENTER;

  const [target, setTarget] = useState({ type: 'platform_fund', organizationId: null });
  const [amount, setAmount] = useState(500);
  const [donor, setDonor] = useState({ name: '', email: '', phone: '', anonymous: false });
  const [status, setStatus] = useState(null);

  const { data: fund } = useQuery({
    queryKey: ['fund'],
    queryFn: async () => (await api.get('/donations/fund')).data,
  });

  const { data: orgs } = useQuery({
    queryKey: ['orgs-donate', center.lat, center.lng],
    queryFn: async () =>
      (await api.get('/organizations/near', { params: { lat: center.lat, lng: center.lng, radiusKm: 60 } })).data,
  });

  const donate = useMutation({
    mutationFn: async () => {
      const order = (
        await api.post('/donations/order', {
          amountInr: Number(amount),
          target,
          donor: { ...donor, email: donor.email || undefined },
        })
      ).data;

      const ready = await loadRazorpay();
      if (!ready) throw new Error('Could not load the payment window. Check your connection.');

      return new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency,
          name: 'StreetPaws',
          description:
            target.type === 'platform_fund'
              ? 'Street dog treatment fund'
              : 'Donation to a rescuer',
          order_id: order.orderId,
          prefill: { name: donor.name, email: donor.email, contact: donor.phone },
          theme: { color: '#ed6820' },
          handler: async (response) => {
            try {
              const res = await api.post('/donations/verify', {
                donationId: order.donationId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              resolve(res.data);
            } catch (err) {
              reject(err);
            }
          },
          modal: { ondismiss: () => reject(new Error('Payment window closed')) },
        });
        rzp.open();
      });
    },
    onSuccess: (res) => setStatus(res),
  });

  if (status) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="text-5xl" aria-hidden="true">💛</div>
        <h1 className="mt-4 text-2xl font-bold">Thank you</h1>
        <p className="mt-2 text-stone-600">Your ₹{status.amountInr} donation went through.</p>
        {status.pendingConfirmation && (
          <p className="mt-3 rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
            We are waiting on final confirmation from the payment provider. This usually takes a few
            seconds and does not need anything from you.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Donate</h1>
        <p className="mt-1 text-sm text-stone-500">
          Give to a specific rescuer, or to the shared fund we distribute for treatment costs.
        </p>
      </header>

      {fund && (
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Raised into the fund" value={`₹${fund.fund.raisedInr.toLocaleString('en-IN')}`} />
          <Stat label="Paid out to rescuers" value={`₹${fund.fund.disbursedInr.toLocaleString('en-IN')}`} />
          <Stat label="Available now" value={`₹${fund.fund.balanceInr.toLocaleString('en-IN')}`} tone="brand" />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">Where should it go?</h2>

            <div className="mt-3 space-y-2">
              <label
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                  target.type === 'platform_fund' ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-stone-200'
                }`}
              >
                <input
                  type="radio"
                  checked={target.type === 'platform_fund'}
                  onChange={() => setTarget({ type: 'platform_fund', organizationId: null })}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold">The StreetPaws fund</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    We pay it out to rescuers for specific treatment costs. Every payment is listed
                    publicly below.
                  </span>
                </span>
              </label>

              <label
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                  target.type === 'organization' ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-stone-200'
                }`}
              >
                <input
                  type="radio"
                  checked={target.type === 'organization'}
                  onChange={() =>
                    setTarget({ type: 'organization', organizationId: orgs?.results?.[0]?.id ?? null })
                  }
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">A specific rescuer</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    Goes directly to an approved NGO or independent rescuer near you.
                  </span>

                  {target.type === 'organization' && (
                    <select
                      value={target.organizationId ?? ''}
                      onChange={(e) => setTarget({ type: 'organization', organizationId: e.target.value })}
                      className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                    >
                      {orgs?.results?.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {o.distanceKm}km
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">How much?</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    Number(amount) === p ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  ₹{p}
                </button>
              ))}
              <input
                type="number"
                min="10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                aria-label="Custom amount in rupees"
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              ₹500 covers a course of antibiotics and dressing for a wound; ₹2,500 covers most minor
              surgeries.
            </p>
          </section>

          <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">Your details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={donor.name}
                onChange={(e) => setDonor((d) => ({ ...d, name: e.target.value }))}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Email (for a receipt)"
                type="email"
                value={donor.email}
                onChange={(e) => setDonor((d) => ({ ...d, email: e.target.value }))}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={donor.anonymous}
                onChange={(e) => setDonor((d) => ({ ...d, anonymous: e.target.checked }))}
              />
              <span>Do not show my name publicly</span>
            </label>

            {donate.isError && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{donate.error.message}</p>
            )}

            <button
              type="button"
              onClick={() => donate.mutate()}
              disabled={donate.isPending || Number(amount) < 10}
              className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {donate.isPending ? 'Opening payment…' : `Donate ₹${amount}`}
            </button>
            <p className="text-center text-xs text-stone-400">
              Payments are handled by Razorpay. We never see your card details.
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Where the fund has gone</h2>
            {!fund && <Spinner label="Loading…" />}
            {fund?.disbursements?.length === 0 && (
              <p className="mt-2 text-sm text-stone-500">
                Nothing has been paid out yet. Every payment will be listed here.
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {fund?.disbursements?.map((d) => (
                <li key={d.id} className="border-b border-stone-100 pb-2 last:border-0">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{d.organization?.name ?? 'Rescuer'}</span>
                    <span className="font-semibold">₹{d.amountInr.toLocaleString('en-IN')}</span>
                  </div>
                  {/* Only the purpose is a lowercase enum needing capitalisation.
                      Applying it to the whole line title-cased the human-written
                      note into "Fracture Repair For The Dog Hit Near...". */}
                  <p className="text-xs text-stone-500">
                    <span className="first-letter:uppercase">{d.purpose.replace('_', ' ')}</span>
                    {d.note ? ` — ${d.note}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
            Only rescuers we have approved can receive money through StreetPaws.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'brand' ? 'border-brand-200 bg-brand-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-stone-900">{value}</p>
    </div>
  );
}
