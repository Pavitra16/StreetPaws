import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useGeolocation, DEFAULT_CENTER } from '../hooks/useGeolocation';
import MapPicker from '../components/map/MapPicker';

const SPECIALIZATIONS = [
  { value: 'injury', label: 'Injuries & wounds' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'skin_disease', label: 'Skin disease / mange' },
  { value: 'puppies', label: 'Puppies & orphans' },
  { value: 'sterilization', label: 'Sterilisation' },
  { value: 'rabies', label: 'Rabies / bite cases' },
  { value: 'shelter', label: 'Shelter space' },
  { value: 'transport', label: 'Transport / ambulance' },
];

export default function OrgRegister() {
  const navigate = useNavigate();
  const { position, locate } = useGeolocation();
  const [place, setPlace] = useState(null);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    name: '',
    kind: 'ngo',
    description: '',
    phone: '',
    email: '',
    website: '',
    serviceRadiusKm: 10,
    capacity: 5,
    specializations: [],
    registrationNumber: '',
    contactPersonName: '',
    yearsActive: '',
    pan: '',
    darpanId: '',
  });

  useEffect(() => {
    locate();
  }, [locate]);
  useEffect(() => {
    if (position && !place) setPlace({ lat: position.lat, lng: position.lng });
  }, [position, place]);
  useEffect(() => {
    const t = setTimeout(() => setPlace((p) => p ?? DEFAULT_CENTER), 3000);
    return () => clearTimeout(t);
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleSpec = (value) =>
    setForm((f) => ({
      ...f,
      specializations: f.specializations.includes(value)
        ? f.specializations.filter((s) => s !== value)
        : [...f.specializations, value],
    }));

  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/organizations', {
          ...form,
          serviceRadiusKm: Number(form.serviceRadiusKm),
          capacity: Number(form.capacity),
          yearsActive: form.yearsActive === '' ? undefined : Number(form.yearsActive),
          website: form.website || undefined,
          registrationNumber: form.registrationNumber || undefined,
          contactPersonName: form.contactPersonName || undefined,
          pan: form.pan || undefined,
          darpanId: form.darpanId || undefined,
          lat: place.lat,
          lng: place.lng,
          address: place.address,
          city: place.city,
          state: place.state,
        })
      ).data,
    onError: (err) => setErrors(err.details ?? {}),
  });

  if (mutation.isSuccess) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="text-5xl" aria-hidden="true">📨</div>
        <h1 className="mt-4 text-2xl font-bold">Application received</h1>
        <p className="mt-2 text-sm text-stone-600">
          An administrator will review your details and email <strong>{form.email}</strong> with your
          sign-in credentials once approved.
        </p>
        <p className="mt-4 text-xs text-stone-500">
          You will not receive dog alerts until your application is approved.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Back to home
        </button>
      </div>
    );
  }

  const valid =
    form.name.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    place &&
    (form.kind !== 'ngo' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Apply as an NGO or rescuer</h1>
        <p className="mt-1 text-sm text-stone-500">
          Applications are reviewed by an administrator before any account is created. Once approved
          you will be alerted about dogs reported near you, worst cases first.
        </p>
      </header>

      <div className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">You are</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { value: 'ngo', label: 'An organisation', hint: 'Registered NGO or shelter' },
              { value: 'private_helper', label: 'An individual', hint: 'Independent rescuer or volunteer' },
            ].map((k) => (
              <label
                key={k.value}
                className={`cursor-pointer rounded-lg border p-3 ${
                  form.kind === k.value ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-stone-200'
                }`}
              >
                <input type="radio" name="kind" value={k.value} checked={form.kind === k.value} onChange={set('kind')} className="sr-only" />
                <span className="block text-sm font-semibold">{k.label}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{k.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Name" error={errors.name}>
          <input value={form.name} onChange={set('name')} className={inputCls} placeholder="Friendicoes SECA" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person">
            <input value={form.contactPersonName} onChange={set('contactPersonName')} className={inputCls} />
          </Field>
          <Field label="Years doing this" optional>
            <input value={form.yearsActive} onChange={set('yearsActive')} type="number" min="0" max="100" className={inputCls} />
          </Field>
        </div>

        {form.kind === 'ngo' && (
          <Field
            label="PAN"
            error={errors.pan}
            hint="Your organisation’s 10-character PAN, e.g. AABCT1234H. We use this to check you are not already registered — society and trust numbers are issued per state, so they are not unique across India."
          >
            <input
              value={form.pan}
              onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
              maxLength={10}
              placeholder="AABCT1234H"
              className={`${inputCls} font-mono uppercase`}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration number"
            optional
            hint="Society, trust deed or Section 8 number."
          >
            <input value={form.registrationNumber} onChange={set('registrationNumber')} className={inputCls} />
          </Field>
          {form.kind === 'ngo' && (
            <Field label="NGO Darpan ID" optional hint="If you are listed on the NITI Aayog portal.">
              <input
                value={form.darpanId}
                onChange={(e) => setForm((f) => ({ ...f, darpanId: e.target.value.toUpperCase() }))}
                className={`${inputCls} font-mono`}
              />
            </Field>
          )}
        </div>

        <Field label="What you do" optional>
          <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errors.phone}>
            <input value={form.phone} onChange={set('phone')} inputMode="tel" className={inputCls} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input value={form.email} onChange={set('email')} type="email" className={inputCls} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How far you can travel (km)">
            <input value={form.serviceRadiusKm} onChange={set('serviceRadiusKm')} type="number" min="1" max="100" className={inputCls} />
          </Field>
          <Field label="Cases you can hold at once">
            <input value={form.capacity} onChange={set('capacity')} type="number" min="0" max="500" className={inputCls} />
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">What you can handle</legend>
          <p className="mt-0.5 text-xs text-stone-500">
            Used to route the right cases to you — a road accident goes to someone with surgery
            capability before a puppy-transport volunteer.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleSpec(s.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  form.specializations.includes(s.value)
                    ? 'bg-brand-600 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Where you are based</p>
          <MapPicker position={place} onChange={setPlace} height={280} />
        </div>

        {mutation.isError && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</p>
        )}

        <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
          Nothing is active until an administrator approves this application — no alerts, no login,
          and you will not appear for adoption or donations. Approval creates your account and emails
          you a temporary password.
        </p>
      </div>

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={!valid || mutation.isPending}
        className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {mutation.isPending ? 'Submitting…' : 'Submit application'}
      </button>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function Field({ label, optional, error, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">
        {label} {optional && <span className="font-normal text-stone-400">(optional)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
