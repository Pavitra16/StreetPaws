import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';

import { api } from '../lib/api';
import Spinner from '../components/common/Spinner';

export default function AdoptionDetail() {
  const { id } = useParams();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    homeType: 'apartment',
    hasOutdoorSpace: false,
    hasOtherPets: false,
    otherPetsDetail: '',
    hasChildren: false,
    experience: '',
    reason: '',
  });
  const [errors, setErrors] = useState({});

  const { data: dog, isPending, isError, error } = useQuery({
    queryKey: ['adoption', id],
    queryFn: async () => (await api.get(`/adoptions/${id}`)).data,
  });

  const apply = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/adoptions/${id}/apply`, {
          applicant: { name: form.name, phone: form.phone, email: form.email || undefined },
          city: form.city || undefined,
          homeType: form.homeType,
          hasOutdoorSpace: form.hasOutdoorSpace,
          hasOtherPets: form.hasOtherPets,
          otherPetsDetail: form.otherPetsDetail || undefined,
          hasChildren: form.hasChildren,
          experience: form.experience || undefined,
          reason: form.reason || undefined,
        })
      ).data,
    onError: (err) => setErrors(err.details ?? {}),
  });

  if (isPending) return <Spinner label="Loading…" />;
  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-semibold">Could not load this dog</p>
        <p className="mt-1 text-sm text-stone-500">{error.message}</p>
        <Link to="/adopt" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          ← Back to adoptions
        </Link>
      </div>
    );
  }

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const org = dog.organizationId;
  const canSubmit = form.name.trim() && form.phone.trim().length >= 6;

  return (
    <div className="space-y-6">
      <Link to="/adopt" className="inline-block text-sm text-stone-500 hover:text-stone-800">
        ← Back to adoptions
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {dog.media?.map((m) => (
              <img
                key={m.cloudinaryPublicId}
                src={m.url}
                alt={dog.name}
                className="w-full rounded-xl bg-stone-100 object-cover"
                loading="lazy"
              />
            ))}
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">{dog.name}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {[
                dog.breed,
                dog.ageMonths != null ? `${Math.floor(dog.ageMonths / 12) || dog.ageMonths} ${dog.ageMonths >= 12 ? 'yrs' : 'months'}` : null,
                dog.size,
                dog.sex !== 'unknown' ? dog.sex : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {dog.story && <p className="whitespace-pre-line text-sm text-stone-700">{dog.story}</p>}

          <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm sm:grid-cols-2">
            <Row label="Vaccinated">{dog.vaccinated ? 'Yes' : 'Not yet'}</Row>
            <Row label="Sterilised">{dog.sterilized ? 'Yes' : 'Not yet'}</Row>
            <Row label="Good with children">{yesNo(dog.goodWith?.kids)}</Row>
            <Row label="Good with dogs">{yesNo(dog.goodWith?.dogs)}</Row>
            <Row label="Good with cats">{yesNo(dog.goodWith?.cats)}</Row>
            <Row label="Temperament">{dog.temperament?.join(', ') || 'Not recorded'}</Row>
            <Row label="Adoption fee">{dog.adoptionFee ? `₹${dog.adoptionFee}` : 'None'}</Row>
            {dog.specialNeeds && <Row label="Special needs">{dog.specialNeeds}</Row>}
          </dl>

          {org && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold">Listed by</h2>
              <p className="mt-1 text-sm text-stone-700">
                {org.name}
                {org.verified && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">verified</span>}
              </p>
              {org.description && <p className="mt-1 text-xs text-stone-500">{org.description}</p>}
            </div>
          )}
        </div>

        <aside>
          {apply.isSuccess ? (
            <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center">
              <div className="text-4xl" aria-hidden="true">🎉</div>
              <h2 className="mt-2 font-semibold text-green-900">Enquiry sent</h2>
              <p className="mt-1 text-sm text-green-900">{apply.data.message}</p>
              <p className="mt-3 text-xs text-green-800">
                Adoption is a conversation, not a form — expect a home check and a chat about your
                routine before anything is agreed.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                apply.mutate();
              }}
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-5"
            >
              <h2 className="font-semibold">Enquire about {dog.name}</h2>
              <p className="text-xs text-stone-500">
                This goes straight to {org?.name ?? 'the rescuer'}. No account needed.
              </p>

              <Field label="Your name" error={errors['applicant.name']}>
                <input value={form.name} onChange={set('name')} className={inputCls} required />
              </Field>
              <Field label="Phone" error={errors['applicant.phone']}>
                <input value={form.phone} onChange={set('phone')} inputMode="tel" className={inputCls} required />
              </Field>
              <Field label="Email" optional>
                <input value={form.email} onChange={set('email')} type="email" className={inputCls} />
              </Field>
              <Field label="City" optional>
                <input value={form.city} onChange={set('city')} className={inputCls} />
              </Field>

              <Field label="Your home">
                <select value={form.homeType} onChange={set('homeType')} className={inputCls}>
                  <option value="apartment">Apartment</option>
                  <option value="independent_house">Independent house</option>
                  <option value="farm">Farm / large plot</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <div className="space-y-1.5 text-sm">
                <Check checked={form.hasOutdoorSpace} onChange={set('hasOutdoorSpace')}>
                  I have outdoor space
                </Check>
                <Check checked={form.hasChildren} onChange={set('hasChildren')}>
                  There are children at home
                </Check>
                <Check checked={form.hasOtherPets} onChange={set('hasOtherPets')}>
                  I have other pets
                </Check>
              </div>

              {form.hasOtherPets && (
                <Field label="Tell us about them">
                  <input value={form.otherPetsDetail} onChange={set('otherPetsDetail')} className={inputCls} />
                </Field>
              )}

              <Field label="Why this dog?" optional>
                <textarea value={form.reason} onChange={set('reason')} rows={3} className={inputCls} />
              </Field>

              {apply.isError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{apply.error.message}</p>
              )}

              <button
                type="submit"
                disabled={!canSubmit || apply.isPending}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {apply.isPending ? 'Sending…' : 'Send enquiry'}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function yesNo(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return 'Not known';
}

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="text-stone-800">{children}</dd>
    </div>
  );
}

function Field({ label, optional, error, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">
        {label} {optional && <span className="font-normal text-stone-400">(optional)</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function Check({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="text-stone-700">{children}</span>
    </label>
  );
}
