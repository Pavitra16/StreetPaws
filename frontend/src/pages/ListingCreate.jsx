import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCloudinaryUpload } from '../hooks/useCloudinaryUpload';
import MediaUploader from '../components/upload/MediaUploader';

const TEMPERAMENTS = ['calm', 'playful', 'shy', 'protective', 'energetic', 'affectionate'];

export default function ListingCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization } = useAuth();
  const uploader = useCloudinaryUpload();
  const [errors, setErrors] = useState({});

  // A rescuer usually lists a dog they already treated, so the report can seed
  // the form rather than making them retype what the AI already extracted.
  const fromReportId = searchParams.get('fromReport');

  const [form, setForm] = useState({
    name: '',
    story: '',
    breed: '',
    ageMonths: '',
    sex: 'unknown',
    size: 'medium',
    vaccinated: false,
    sterilized: false,
    specialNeeds: '',
    temperament: [],
    goodWithKids: null,
    goodWithDogs: null,
    goodWithCats: null,
    adoptionFee: 0,
  });

  useQuery({
    queryKey: ['report-prefill', fromReportId],
    enabled: Boolean(fromReportId),
    queryFn: async () => {
      const report = (await api.get(`/reports/${fromReportId}`)).data;
      setForm((f) => ({
        ...f,
        breed: f.breed || report.aiAnalysis?.breed || '',
        size: report.aiAnalysis?.sizeEstimate && report.aiAnalysis.sizeEstimate !== 'unknown'
          ? report.aiAnalysis.sizeEstimate
          : f.size,
        story: f.story || report.aiAnalysis?.generatedDescription || '',
      }));
      return report;
    },
  });

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const toggleTemperament = (t) =>
    setForm((f) => ({
      ...f,
      temperament: f.temperament.includes(t)
        ? f.temperament.filter((x) => x !== t)
        : [...f.temperament, t],
    }));

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/adoptions', {
          name: form.name,
          story: form.story || undefined,
          media: uploader.toMediaPayload(),
          breed: form.breed || undefined,
          ageMonths: form.ageMonths === '' ? undefined : Number(form.ageMonths),
          sex: form.sex,
          size: form.size,
          vaccinated: form.vaccinated,
          sterilized: form.sterilized,
          specialNeeds: form.specialNeeds || undefined,
          temperament: form.temperament,
          goodWith: {
            kids: form.goodWithKids,
            dogs: form.goodWithDogs,
            cats: form.goodWithCats,
          },
          adoptionFee: Number(form.adoptionFee) || 0,
          sourceReportId: fromReportId ?? undefined,
        })
      ).data,
    onSuccess: (listing) => navigate(`/adopt/${listing.id}`),
    onError: (err) => setErrors(err.details ?? {}),
  });

  const canSubmit = form.name.trim() && uploader.doneCount > 0 && !uploader.isUploading;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/rescuer" className="inline-block text-sm text-stone-500 hover:text-stone-800">
        ← Back to my cases
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">List a dog for adoption</h1>
        <p className="mt-1 text-sm text-stone-500">
          This will appear publicly under {organization?.name ?? 'your organisation'}. Enquiries come
          straight to you.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Photos</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            The first photo is what people see when browsing. A clear, well-lit shot of the whole dog
            gets far more enquiries than a close-up.
          </p>
          <div className="mt-3">
            <MediaUploader uploader={uploader} />
          </div>
        </div>

        <Field label="Name" error={errors.name}>
          <input value={form.name} onChange={set('name')} placeholder="Laddu" className={inputCls} />
        </Field>

        <Field label="Their story" optional hint="What happened to them, and what they are like now.">
          <textarea value={form.story} onChange={set('story')} rows={4} className={inputCls} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Breed" optional>
            <input value={form.breed} onChange={set('breed')} placeholder="Indian Pariah" className={inputCls} />
          </Field>
          <Field label="Age in months" optional>
            <input value={form.ageMonths} onChange={set('ageMonths')} type="number" min="0" max="300" className={inputCls} />
          </Field>
          <Field label="Sex">
            <select value={form.sex} onChange={set('sex')} className={inputCls}>
              <option value="unknown">Not known</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Size">
            <select value={form.size} onChange={set('size')} className={inputCls}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Medical</legend>
          <div className="mt-2 space-y-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.vaccinated} onChange={set('vaccinated')} />
              <span>Vaccinated</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.sterilized} onChange={set('sterilized')} />
              <span>Sterilised</span>
            </label>
          </div>
        </fieldset>

        <Field label="Special needs" optional hint="Ongoing medication, a disability, anything an adopter must plan for.">
          <input value={form.specialNeeds} onChange={set('specialNeeds')} className={inputCls} />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Temperament</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPERAMENTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTemperament(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium first-letter:uppercase ${
                  form.temperament.includes(t)
                    ? 'bg-brand-600 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Gets on with</legend>
          <p className="mt-0.5 text-xs text-stone-500">
            Leave as “not known” rather than guessing — an adopter with a toddler needs the honest
            answer.
          </p>
          <div className="mt-2 space-y-2">
            <Tristate label="Children" value={form.goodWithKids} onChange={(v) => setForm((f) => ({ ...f, goodWithKids: v }))} />
            <Tristate label="Other dogs" value={form.goodWithDogs} onChange={(v) => setForm((f) => ({ ...f, goodWithDogs: v }))} />
            <Tristate label="Cats" value={form.goodWithCats} onChange={(v) => setForm((f) => ({ ...f, goodWithCats: v }))} />
          </div>
        </fieldset>

        <Field label="Adoption fee (₹)" optional hint="Leave at 0 if you do not charge one.">
          <input value={form.adoptionFee} onChange={set('adoptionFee')} type="number" min="0" className={inputCls} />
        </Field>

        {create.isError && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{create.error.message}</p>
        )}
      </section>

      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={!canSubmit || create.isPending}
        className="w-full rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {create.isPending ? 'Publishing…' : 'Publish listing'}
      </button>
      {uploader.doneCount === 0 && (
        <p className="text-center text-xs text-stone-500">At least one photo is needed.</p>
      )}
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

/** Yes / No / Not known — because "unticked" and "no" mean different things here. */
function Tristate({ label, value, onChange }) {
  const options = [
    { v: true, label: 'Yes' },
    { v: false, label: 'No' },
    { v: null, label: 'Not known' },
  ];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-stone-700">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              value === o.v ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
