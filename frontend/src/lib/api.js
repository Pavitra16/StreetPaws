import axios from 'axios';

/**
 * In development this stays relative and Vite proxies /api to the backend, so
 * there is no CORS preflight to debug locally.
 *
 * In production the frontend and the API are on different hosts, and a relative
 * path would send every request to the static site — which has no /api — and
 * 404. VITE_API_URL is baked in at build time and must be the API's absolute
 * origin, e.g. https://streetpaws-api.onrender.com/api
 *
 * Nothing secret belongs in a VITE_ variable: they ship to the browser in clear.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
  // The session lives in an httpOnly cookie, so it must ride along with requests.
  withCredentials: true,
});

/**
 * The server returns errors as { error: { message, details } }. Without this
 * every component would end up rendering "Request failed with status code 400".
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const payload = error.response?.data?.error;

    if (payload?.message) {
      error.message = payload.message;
      error.details = payload.details;
    } else if (error.code === 'ECONNABORTED') {
      error.message = 'The request timed out. Check your connection and try again.';
    } else if (!error.response) {
      error.message = 'Could not reach the server. Check your connection.';
    } else if (status === 502 || status === 503 || status === 504) {
      // A gateway error has a response but no JSON body of ours, so it used to
      // fall through to axios's raw "Request failed with status code 502".
      // Usually a restart or deploy — transient, and worth saying so.
      error.message = 'The server is temporarily unavailable. Retrying shortly…';
    } else if (status === 429) {
      error.message = 'Too many requests. Please wait a moment and try again.';
    } else if (status >= 500) {
      error.message = 'Something went wrong on our side. Please try again.';
    }

    return Promise.reject(error);
  }
);
