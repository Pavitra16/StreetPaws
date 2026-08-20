import { useState } from 'react';

/**
 * What someone does after they open a lost-dog page.
 *
 * Without these the page is a dead end: it tells you a dog is missing and gives
 * you nowhere to go. The person reading it is usually a stranger who has just
 * spotted the dog, has no account, and will not fill in a form — so every action
 * here is one tap and none of them require signing in.
 */

/** wa.me wants digits only; stored numbers look like "+91 97170 63328". */
function waNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

function shareText(report) {
  const name = report.dogName ?? 'A dog';
  const where = report.location?.address ?? report.location?.city;
  return [
    `${name} is missing${where ? ` near ${where}` : ''}.`,
    report.description,
    'Details and photos:',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export default function LostDogActions({ report }) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const phone = report.contact?.masked ? null : report.contact?.phone;
  const wa = phone ? waNumber(phone) : null;
  const name = report.dogName ?? 'this dog';

  const mapsUrl =
    report.lat != null && report.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`
      : null;

  async function share() {
    const text = shareText(report);
    // navigator.share is the whole point on a phone — it opens WhatsApp, which
    // is where lost dogs in India actually get found. Desktop falls back to copy.
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} is missing`, text, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user dismissed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  const primary =
    'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition';
  const secondary =
    'flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50';

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-5">
      <h2 className="text-sm font-semibold text-sky-950">Have you seen {name}?</h2>
      <p className="mt-1 text-xs text-sky-900/70">
        {phone
          ? 'Call the owner straight away, or log where you saw the dog so they can follow the trail.'
          : 'Log where you saw the dog. The owner is notified, and a verified rescuer can reach them.'}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {phone && (
          <a href={`tel:${phone.replace(/\s/g, '')}`} className={`${primary} bg-sky-700 text-white hover:bg-sky-800`}>
            Call {report.contact?.name?.split(' ')[0] ?? 'the owner'}
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(
              `Hi, I think I've seen ${name}. I found your report on StreetPaws: ${url}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${primary} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            WhatsApp
          </a>
        )}

        <button type="button" onClick={share} className={secondary}>
          {copied ? 'Link copied' : 'Share'}
        </button>

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={secondary}>
            Open in Maps
          </a>
        )}
      </div>
    </section>
  );
}
