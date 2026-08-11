import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 0;
      background:#ed6820;border:3px solid #fff;
      box-shadow:0 3px 8px rgba(0,0,0,.4);
      transform:rotate(-45deg)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function ClickToMove({ onMove }) {
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ position }) {
  const map = useMap();
  const last = useRef(null);
  useEffect(() => {
    if (!position) return;
    const key = `${position.lat},${position.lng}`;
    // Only recentre when the position came from outside (geolocation, search) —
    // recentring on every drag would fight the user for control of the map.
    if (last.current === key) return;
    last.current = key;
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 16));
  }, [position, map]);
  return null;
}

/**
 * Reverse-geocodes via Nominatim. Their usage policy asks for a low request rate
 * and an identifying referer, so this only fires when the pin settles, never
 * during a drag.
 */
async function reverseGeocode({ lat, lng }) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not look up this address');
  const j = await res.json();
  const a = j.address ?? {};
  return {
    address: j.display_name,
    city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.state_district,
    state: a.state,
    pincode: a.postcode,
  };
}

export default function MapPicker({ position, onChange, height = 340 }) {
  const [lookup, setLookup] = useState({ status: 'idle', data: null, error: null });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    setLookup((l) => ({ ...l, status: 'loading' }));

    const t = setTimeout(async () => {
      try {
        const data = await reverseGeocode(position);
        if (cancelled) return;
        setLookup({ status: 'done', data, error: null });
        onChange?.({ ...position, ...data });
      } catch (err) {
        if (cancelled) return;
        // A failed lookup is cosmetic — the coordinates are what actually matter.
        setLookup({ status: 'error', data: null, error: err.message });
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`
      );
      const [hit] = await res.json();
      if (hit) onChange?.({ lat: Number(hit.lat), lng: Number(hit.lon) });
    } finally {
      setSearching(false);
    }
  };

  if (!position) return null;

  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a landmark or area…"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
        >
          {searching ? '…' : 'Search'}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-stone-200" style={{ height }}>
        <MapContainer center={[position.lat, position.lng]} zoom={16} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Recenter position={position} />
          <ClickToMove onMove={onChange} />
          <Marker
            position={[position.lat, position.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                onChange?.({ lat, lng });
              },
            }}
          />
        </MapContainer>
      </div>

      <p className="text-xs text-stone-500">
        Drag the pin — or tap the map — to the exact spot where the dog is.
      </p>

      <div className="rounded-lg bg-stone-50 p-3 text-xs">
        {lookup.status === 'loading' && <span className="text-stone-500">Looking up address…</span>}
        {lookup.status === 'done' && <span className="text-stone-700">📍 {lookup.data.address}</span>}
        {lookup.status === 'error' && (
          <span className="text-stone-500">
            Address lookup unavailable — the exact coordinates are still recorded.
          </span>
        )}
        <span className="mt-1 block font-mono text-[11px] text-stone-400">
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
