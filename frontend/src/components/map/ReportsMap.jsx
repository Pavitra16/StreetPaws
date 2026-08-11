import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { urgencyMeta, timeAgo } from '../../lib/urgency';
import { reportText } from '../../lib/reportText';

/**
 * Leaflet's default marker points at PNGs resolved relative to the CSS, which
 * bundlers rewrite and break. divIcon sidesteps the asset problem entirely and
 * lets the pin carry the urgency level, so severity is readable from the map.
 */
function pinIcon(urgency) {
  const { hex, label } = urgencyMeta(urgency);
  return L.divIcon({
    className: '',
    html: `<div role="img" aria-label="${label}" style="
        width:26px;height:26px;border-radius:50% 50% 50% 0;
        background:${hex};border:2.5px solid #fff;
        box-shadow:0 2px 5px rgba(0,0,0,.35);
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:#fff;font:700 12px system-ui">${urgency}</span>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -26],
  });
}

/** Recentres when the search origin changes; MapContainer.center is initial-only. */
function Recenter({ center, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    // Fit the search circle rather than guessing a zoom level.
    const bounds = L.latLng(center.lat, center.lng).toBounds(radiusKm * 2000);
    map.fitBounds(bounds, { padding: [24, 24], animate: true });
  }, [center?.lat, center?.lng, radiusKm, map]);
  return null;
}

export default function ReportsMap({ center, radiusKm = 15, reports = [], selectedId, onSelect, height = 460 }) {
  const markers = useMemo(
    () => reports.filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number'),
    [reports]
  );

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200" style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Recenter center={center} radiusKm={radiusKm} />

        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#ed6820', weight: 1, fillOpacity: 0.05 }}
        />

        {markers.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            icon={pinIcon(r.effectiveUrgency)}
            zIndexOffset={r.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(r.id) }}
          >
            <Popup>
              <div className="w-52">
                {r.primaryMedia?.thumbnailUrl && (
                  <img
                    src={r.primaryMedia.thumbnailUrl}
                    alt=""
                    className="mb-2 h-24 w-full rounded object-cover"
                    loading="lazy"
                  />
                )}
                <p className="text-xs font-semibold text-stone-900">
                  {urgencyMeta(r.effectiveUrgency).label}
                  {r.aiAnalysis?.breed ? ` · ${r.aiAnalysis.breed}` : ''}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-stone-600">{reportText(r).text}</p>
                <p className="mt-1 text-[11px] text-stone-400">
                  {r.distanceKm != null ? `${r.distanceKm} km · ` : ''}
                  {timeAgo(r.occurredAt)}
                </p>
                <Link
                  to={`/reports/${r.id}`}
                  className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline"
                >
                  View report →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
