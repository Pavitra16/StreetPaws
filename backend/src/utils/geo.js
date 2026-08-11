/**
 * Every lng/lat vs lat/lng conversion in the backend lives here. GeoJSON stores
 * [longitude, latitude]; humans, URLs and Leaflet all say latitude first. Mixing
 * the two silently puts Delhi in the Indian Ocean, so it is worth centralising.
 */

export function toPoint({ lat, lng, address, city, state, pincode } = {}) {
  return {
    type: 'Point',
    coordinates: [Number(lng), Number(lat)],
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(pincode ? { pincode } : {}),
  };
}

export function fromPoint(point) {
  if (!point?.coordinates) return null;
  const [lng, lat] = point.coordinates;
  return { lat, lng };
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance. Used for display and scoring, not for querying. */
export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Builds a $geoWithin filter — cheaper than $near when you also want to sort by something else. */
export function withinRadius(lat, lng, radiusKm) {
  return {
    $geoWithin: {
      $centerSphere: [[Number(lng), Number(lat)], Number(radiusKm) / EARTH_RADIUS_KM],
    },
  };
}

/** Random point within `radiusKm` of a centre — seed data only. */
export function jitter(lat, lng, radiusKm) {
  const r = radiusKm * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (r / 111.32) * Math.cos(theta);
  const dLng = ((r / 111.32) * Math.sin(theta)) / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + dLat, lng: lng + dLng };
}
