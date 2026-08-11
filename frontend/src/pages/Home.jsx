import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const CARDS = [
  {
    to: '/report',
    icon: '📸',
    title: 'Report a dog',
    body: 'Photo, video and the exact spot you found them. Nearby rescuers are alerted, worst cases first.',
  },
  {
    to: '/find',
    icon: '🔍',
    title: 'Find a dog',
    body: 'Lost your dog? Search by area and breed, or upload a photo and let us match it against reports.',
  },
  {
    to: '/adopt',
    icon: '🏠',
    title: 'Adopt',
    body: 'Dogs ready for a home, listed by verified NGOs and independent rescuers.',
  },
  {
    to: '/donate',
    icon: '💛',
    title: 'Donate',
    body: 'Fund a specific dog’s treatment, back a rescuer directly, or give to the shared pool.',
  },
];

export default function Home() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get('/health')).data,
    retry: false,
  });

  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-14 text-white sm:px-12">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Found a street dog that needs help?
        </h1>
        <p className="mt-3 max-w-xl text-brand-50">
          Take a photo, drop a pin, and the nearest rescuers get alerted within seconds. Injured and
          critical cases go to the top of their queue automatically.
        </p>
        <Link
          to="/report"
          className="mt-7 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02]"
        >
          Report a dog now
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group rounded-xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="text-2xl" aria-hidden="true">
              {card.icon}
            </div>
            <h2 className="mt-3 font-semibold group-hover:text-brand-700">{card.title}</h2>
            <p className="mt-1 text-sm text-stone-500">{card.body}</p>
          </Link>
        ))}
      </section>

      {health && (
        <p className="text-xs text-stone-400">
          API {health.ok ? 'online' : 'offline'} · database {health.db}
        </p>
      )}
    </div>
  );
}
