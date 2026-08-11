import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

import { api } from '../lib/api';
import Spinner from '../components/common/Spinner';
import AIAnalysisPanel from '../components/ai/AIAnalysisPanel';
import { urgencyMeta, timeAgo, CONDITION_LABEL, STATUS_LABEL } from '../lib/urgency';
import { reportBreed } from '../lib/reportText';

/**
 * A breed of "unknown"/"Unknown" is a real model output, and interpolating it
 * straight into the heading produced "unknown — injured".
 */
function buildTitle(report) {
  if (report.kind === 'lost' && report.dogName) return `${report.dogName} is missing`;
  if (report.aiAnalysis?.isDog === false) return 'Photo needs review';

  // What the reporter typed wins over the model's read — see reportBreed().
  const { text: usableBreed } = reportBreed(report);
  const condition = CONDITION_LABEL[report.condition]?.toLowerCase();

  if (usableBreed) return `${usableBreed} — ${condition}`;
  return report.condition === 'healthy' ? 'Dog reported' : `Dog reported — ${condition}`;
}

const dot = (hex) =>
  L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${hex};border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.35)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

export default function ReportDetail() {
  const { id } = useParams();

  const { data: report, isPending, isError, error } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => (await api.get(`/reports/${id}`)).data,
    /**
     * Analysis runs in the background after the report is saved, so the first
     * render almost always shows "analysing". Poll until it settles, then stop —
     * without this the panel sits on a spinner forever.
     */
    refetchInterval: (query) => {
      const state = query.state.data?.analysisState;
      return state === 'pending' || state === 'processing' ? 2500 : false;
    },
  });

  if (isPending) return <Spinner label="Loading report…" />;

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-semibold">Could not load this report</p>
        <p className="mt-1 text-sm text-stone-500">{error.message}</p>
        <Link to="/find" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  const u = urgencyMeta(report.effectiveUrgency);
  const images = report.media?.filter((m) => m.resourceType === 'image') ?? [];
  const videos = report.media?.filter((m) => m.resourceType === 'video') ?? [];

  // Only usable as a description when the model actually saw a dog; otherwise it
  // reads "no dog is visible", which is not a description of anything.
  const generatedText =
    report.aiAnalysis?.isDog !== false ? report.aiAnalysis?.generatedDescription : null;

  return (
    <div className="space-y-6">
      <Link to="/find" className="inline-block text-sm text-stone-500 hover:text-stone-800">
        ← Back to search
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${u.chip}`}>
          {u.label}
        </span>
        {/* The reporter's own pick, shown only when it adds something the
            urgency label doesn't already say (e.g. "Critical / Critical"). */}
        {CONDITION_LABEL[report.condition] !== u.label && (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
            Reported as {CONDITION_LABEL[report.condition].toLowerCase()}
          </span>
        )}
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {STATUS_LABEL[report.status] ?? report.status}
        </span>
        {report.kind === 'lost' && (
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
            Lost dog
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{buildTitle(report)}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {images.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {images.map((m) => (
                <img
                  key={m.cloudinaryPublicId}
                  src={m.url}
                  alt=""
                  className="w-full rounded-xl bg-stone-100 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {videos.map((m) => (
            <video key={m.cloudinaryPublicId} src={m.url} controls className="w-full rounded-xl bg-black" />
          ))}

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">
              {report.description ? 'What the reporter saw' : 'Description'}
            </h2>

            {report.description ? (
              <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{report.description}</p>
            ) : generatedText ? (
              // The reporter was told they could skip typing and we would write this
              // from the photo. This is where we keep that promise.
              <>
                <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{generatedText}</p>
                <p className="mt-2 text-xs text-stone-400">
                  Written automatically from the photo — the reporter did not add a description.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-stone-500">
                No description was added, and none could be generated from the photo.
              </p>
            )}

            <p className="mt-3 text-xs text-stone-400">
              Reported {timeAgo(report.createdAt)} · seen {timeAgo(report.occurredAt)}
            </p>
          </section>

          <AIAnalysisPanel
            analysis={report.aiAnalysis}
            state={report.analysisState}
            condition={report.condition}
            disagreement={report.urgencyDisagreement}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Where</h2>
            <p className="mt-1 text-sm text-stone-600">
              {report.location?.address ?? report.location?.city ?? 'Location recorded'}
            </p>
            {report.lat != null && (
              <div className="mt-3 h-48 overflow-hidden rounded-lg border border-stone-200">
                <MapContainer
                  center={[report.lat, report.lng]}
                  zoom={15}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[report.lat, report.lng]} icon={dot(u.hex)} />
                </MapContainer>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">Reporter</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Name</dt>
                <dd className="text-stone-800">{report.contact?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Phone</dt>
                <dd className="font-mono text-stone-800">{report.contact?.phone ?? '—'}</dd>
              </div>
            </dl>
            {report.contact?.masked && (
              <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
                Contact details are hidden to protect the reporter. Verified rescuers see the full
                number when they take on a case.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
