import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <div className="text-5xl" aria-hidden="true">
        🐾
      </div>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-stone-500">This trail leads nowhere.</p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
        Back to home
      </Link>
    </div>
  );
}
