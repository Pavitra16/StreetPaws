import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useCloudinaryUpload } from '../hooks/useCloudinaryUpload';
import { useGeolocation, DEFAULT_CENTER } from '../hooks/useGeolocation';
import MediaUploader from '../components/upload/MediaUploader';
import MapPicker from '../components/map/MapPicker';
import { BreedDatalist, BREED_LIST_ID } from '../lib/breeds.jsx';

const CONDITIONS = [
  { value: 'critical', label: 'Critical', hint: 'Bleeding, cannot stand, hit by a vehicle' },
  { value: 'injured', label: 'Injured', hint: 'Visible wound, limping, in pain' },
  { value: 'sick', label: 'Sick', hint: 'Skin disease, very thin, coughing, weak' },
  { value: 'healthy', label: 'Looks healthy', hint: 'No visible problem — lost or abandoned' },
];

const STEPS = ['Photos', 'Location', 'Details', 'Contact'];

export default function ReportDog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = searchParams.get('kind') === 'lost' ? 'lost' : 'found';

  const [step, setStep] = useState(0);
  const [place, setPlace] = useState(null);
  const [form, setForm] = useState({
    condition: 'injured',
    description: '',
    dogName: '',
    breedGuess: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    preferredChannel: 'phone',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const uploader = useCloudinaryUpload();
  const { position, error: geoError, locate, status: geoStatus } = useGeolocation();

  useEffect(() => {
    locate();
  }, [locate]);

  // Seed the pin from geolocation, but never overwrite a pin the user has moved.
  useEffect(() => {
    if (position && !place) setPlace({ lat: position.lat, lng: position.lng });
  }, [position, place]);

  useEffect(() => {
    if (!place && geoStatus !== 'idle' && geoStatus !== 'locating' && geoStatus !== 'granted') {
      setPlace(DEFAULT_CENTER);
    }
  }, [geoStatus, place]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const media = uploader.toMediaPayload();
      const payload = {
        kind,
        media,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        city: place.city,
        state: place.state,
        pincode: place.pincode,
        condition: kind === 'lost' ? 'healthy' : form.condition,
        description: form.description || undefined,
        dogName: form.dogName || undefined,
        breedGuess: form.breedGuess || undefined,
        contact: {
          name: form.contactName,
          phone: form.contactPhone,
          email: form.contactEmail || undefined,
          preferredChannel: form.preferredChannel,
        },
      };
      return (await api.post('/reports', payload)).data;
    },
    onSuccess: (report) => {
      uploader.reset();
      navigate(`/reports/${report.id}?new=1`);
    },
    onError: (err) => setFieldErrors(err.details ?? {}),
  });

  const canLeaveStep = {
    0: uploader.doneCount > 0,
    1: Boolean(place),
    2: kind !== 'lost' || form.dogName.trim().length > 0,
    3: form.contactName.trim().length > 0 && form.contactPhone.trim().length >= 6,
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {kind === 'lost' ? 'Report a lost dog' : 'Report a dog that needs help'}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {kind === 'lost'
            ? 'We will match your dog against dogs people have found nearby.'
            : 'Nearby rescuers are alerted as soon as you submit. Takes about a minute.'}
        </p>
      </header>

      <ol className="flex gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div
              className={[
                'h-1 rounded-full transition-colors',
                i < step ? 'bg-brand-600' : i === step ? 'bg-brand-400' : 'bg-stone-200',
              ].join(' ')}
            />
            <span className={`mt-1 block text-xs ${i === step ? 'font-semibold text-stone-800' : 'text-stone-400'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        {step === 0 && (
          <section className="space-y-4">
            <h2 className="font-semibold">Add a photo</h2>
            <MediaUploader uploader={uploader} />
            {uploader.doneCount === 0 && (
              <p className="text-xs text-stone-500">At least one photo is needed to continue.</p>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {kind === 'lost' ? 'Where was the dog last seen?' : 'Where is the dog?'}
              </h2>
              <button
                type="button"
                onClick={locate}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
              >
                📍 Use my location
              </button>
            </div>
            {geoError && <p className="text-xs text-amber-700">{geoError}</p>}
            <MapPicker position={place} onChange={setPlace} />
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <h2 className="font-semibold">What is going on?</h2>

            {kind === 'found' && (
              <fieldset>
                <legend className="text-sm font-medium text-stone-700">Condition</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CONDITIONS.map((c) => (
                    <label
                      key={c.value}
                      className={[
                        'cursor-pointer rounded-lg border p-3 transition-colors',
                        form.condition === c.value
                          ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                          : 'border-stone-200 hover:border-stone-300',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="condition"
                        value={c.value}
                        checked={form.condition === c.value}
                        onChange={set('condition')}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-stone-800">{c.label}</span>
                      <span className="mt-0.5 block text-xs text-stone-500">{c.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {kind === 'lost' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-stone-700">Your dog’s name</span>
                <input
                  value={form.dogName}
                  onChange={set('dogName')}
                  placeholder="Bruno"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                {fieldErrors.dogName && <span className="mt-1 block text-xs text-red-600">{fieldErrors.dogName}</span>}
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">
                Breed <span className="font-normal text-stone-400">(if you know)</span>
              </span>
              {/* Suggestions, not a fixed list — see lib/breeds.jsx. Leaving
                  this blank is a fine answer, and a blank breed still shows up
                  in breed searches, so a guess is never required. */}
              <input
                value={form.breedGuess}
                onChange={set('breedGuess')}
                list={BREED_LIST_ID}
                placeholder="Start typing, or leave blank if unsure"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <BreedDatalist />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">
                What did you see? <span className="font-normal text-stone-400">(optional)</span>
              </span>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={4}
                placeholder="Limping on the front-right leg, sitting near the metro gate since morning…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <span className="mt-1 block text-xs text-stone-500">
                Leave this blank if you are in a hurry — we generate a description from your photo.
              </span>
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h2 className="font-semibold">How can a rescuer reach you?</h2>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Your name</span>
              <input
                value={form.contactName}
                onChange={set('contactName')}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {fieldErrors['contact.name'] && (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors['contact.name']}</span>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">Phone</span>
              <input
                value={form.contactPhone}
                onChange={set('contactPhone')}
                inputMode="tel"
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {fieldErrors['contact.phone'] && (
                <span className="mt-1 block text-xs text-red-600">{fieldErrors['contact.phone']}</span>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-stone-700">
                Email <span className="font-normal text-stone-400">(optional)</span>
              </span>
              <input
                value={form.contactEmail}
                onChange={set('contactEmail')}
                type="email"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
              Your number is hidden on the public page. Only a verified rescuer taking on this case
              can see it.
            </p>

            {mutation.isError && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</p>
            )}
          </section>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40"
        >
          Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canLeaveStep[3] || mutation.isPending || uploader.isUploading}
            className="rounded-lg bg-red-600 px-6 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit report'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canLeaveStep[step]}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
