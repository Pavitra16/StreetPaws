import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
  /**
   * Vite inlines VITE_* at BUILD time, so a missing VITE_API_URL cannot be
   * corrected by restarting the server — it needs a rebuild and redeploy.
   *
   * Worse, it fails silently: api.js falls back to a relative `/api`, which in
   * production resolves against the static host. That host has no API, so every
   * request 404s and the site looks broken with nothing in the logs explaining
   * why. This is the one deployment mistake here with no visible cause.
   *
   * The fallback is only ever correct behind the dev proxy below. The backend
   * serves no static files, so a deployed frontend is always on a different
   * origin from the API — meaning there is no such thing as a valid production
   * build without this set. Fail now, where the message can say what is wrong,
   * rather than after it is deployed.
   */
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const apiUrl = fileEnv.VITE_API_URL || process.env.VITE_API_URL;

  if (command === 'build' && !apiUrl) {
    throw new Error(
      'VITE_API_URL is not set, and a production build needs it.\n\n' +
        "  It must be the API's absolute origin including /api, e.g.\n" +
        '      VITE_API_URL=https://streetpaws-api.onrender.com/api\n\n' +
        '  Set it in the host\'s environment settings (it is read at build time,\n' +
        '  not runtime), or locally for a one-off build:\n' +
        '      VITE_API_URL=http://localhost:5000/api npm run build\n\n' +
        "  The backend's CLIENT_ORIGIN must point back at wherever this is served."
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // Proxying /api in dev means the frontend never needs an absolute API URL,
      // and there is no CORS preflight to debug locally.
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
