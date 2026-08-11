import { useCallback, useState } from 'react';

// Connaught Place. Used until the browser gives us something better, so the map
// never opens on the middle of the ocean.
export const DEFAULT_CENTER = { lat: 28.6315, lng: 77.2167 };

export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | locating | granted | denied | unavailable
  const [error, setError] = useState(null);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('This browser does not support location access.');
      return;
    }

    setStatus('locating');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setStatus('granted');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can still search by moving the map.'
            : 'Could not determine your location. You can still search by moving the map.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return { position, status, error, locate };
}
