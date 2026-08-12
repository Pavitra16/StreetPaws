import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import Reveal from '../components/home/Reveal';
import CountUp from '../components/home/CountUp';
import PawTrail from '../components/home/PawTrail';
import RoutingMap from '../components/home/RoutingMap';
import TriageDemo from '../components/home/TriageDemo';
import HeroCarousel from '../components/home/HeroCarousel';

const ACTIONS = [
  {
    to: '/report',
    icon: '📸',
    title: 'Report a dog',
    body: 'Photo, video and the exact spot you found them. Nearby rescuers are alerted, worst cases first.',
  },
  {
    to: '/find',
    icon: '🔍',
    title: 'Find a lost dog',
    body: 'Search by area and breed, or upload a photo and let us match it against every open report.',
  },
  {
    to: '/adopt',
    icon: '🏠',
    title: 'Adopt',
    body: 'Dogs ready for a home, listed by approved NGOs and independent rescuers.',
  },
  {
    to: '/donate',
    icon: '💗',
    title: 'Donate',
    body: 'Fund one dog’s treatment, back a rescuer directly, or give to the shared pool.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Photograph the dog',
    body: 'One photo is enough. A video helps if the dog is moving oddly.',
  },
  {
    n: '2',
    title: 'Drop a pin on the exact spot',
    body: 'Street dogs do not stay put. The closer the pin, the faster they are found.',
  },
  {
    n: '3',
    title: 'A rescuer accepts',
    body: 'The nearest approved NGO or independent rescuer with spare capacity takes the case.',
  },
];

export default function Home() {
  const { data: fund } = useQuery({
    queryKey: ['fund'],
    queryFn: async () => (await api.get('/donations/fund')).data,
    retry: false,
  });

  const { data: adoptions } = useQuery({
    queryKey: ['adoptions', 'home'],
    queryFn: async () => (await api.get('/adoptions')).data,
    retry: false,
  });

  const dogs = (adoptions?.results ?? []).slice(0, 4);


  return (
    <div className="space-y-20 sm:space-y-24">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="paw-bg-light relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-700 px-6 py-14 text-white sm:px-12 sm:py-20">
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Reveal>
              <span className="inline-block rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold tracking-wide">
                Delhi NCR
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-4 max-w-[17ch] text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Found a street dog that needs help?
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-4 max-w-lg text-brand-50">
                Take a photo, drop a pin, and nearby rescuers are alerted within seconds. Injured and
                critical cases go to the top of their queue automatically.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/report"
                  className="rounded-xl bg-white px-6 py-3.5 font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                  Report a dog now
                </Link>
                {/* Solid 2px outline, no translucent fill — the design brief
                    rules out frosted panels, and a white overlay on a gradient
                    is the same effect by another name. */}
                <Link
                  to="/find"
                  className="rounded-xl border-2 border-white px-6 py-3.5 font-semibold text-white transition-colors hover:bg-white hover:text-brand-700"
                >
                  I’ve lost my dog
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Real animals from the adoption listings rather than stock
              photographs, and all of them rather than one — every dog here is
              waiting, which a rotation says and a single portrait does not.
              The street dog leads, because that is what the site is about. */}
          <Reveal delay={200} className="hidden lg:block">
            <HeroCarousel />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ ACTIONS */}
      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map((card, i) => (
            <Reveal key={card.to} delay={i * 90}>
              <Link
                to={card.to}
                className="group block h-full rounded-2xl border border-stone-200 bg-white p-5 transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_12px_28px_-12px_rgba(174,36,85,0.34)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div
                  className="grid size-11 place-items-center rounded-xl bg-brand-100 text-xl"
                  aria-hidden="true"
                >
                  {card.icon}
                </div>
                <h2 className="mt-3 font-semibold group-hover:text-brand-700">{card.title}</h2>
                <p className="mt-1 text-sm text-stone-500">{card.body}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- HOW IT WORKS */}
      <section>
        <Reveal className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Three steps, about a minute</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-500">
            You do not need an account, and you do not need to know anything about dogs.
          </p>
        </Reveal>

        <PawTrail className="mx-auto mt-10 hidden max-w-3xl px-12 lg:flex" />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="h-full rounded-2xl border border-stone-200 bg-white p-6">
                <div className="grid size-10 place-items-center rounded-full bg-brand-600 font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-stone-500">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- TRIAGE */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            The worst case gets seen first
          </h2>
          <p className="mt-3 text-stone-600">
            Every photo is read by a vision model that estimates breed, colours, distinctive marks
            and visible injuries, then scores urgency from 1 to 5. That score is what orders a
            rescuer’s queue, so a bleeding dog is not sitting behind a healthy one.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            If you tell us the dog is critical, it stays critical. The model can raise your
            assessment; it is never allowed to lower it.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <TriageDemo />
        </Reveal>
      </section>

      {/* ------------------------------------------------------------- ROUTING */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <Reveal className="lg:order-2">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Straight to the nearest verified rescuer
          </h2>
          <p className="mt-3 text-stone-600">
            The report goes to approved NGOs and independent rescuers whose own service radius
            covers the spot, ranked by distance, spare capacity and what they can actually treat — a
            road accident reaches someone with surgical capability before it reaches a puppy-transport
            volunteer.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            First to accept takes the case; everyone else’s alert closes automatically.
          </p>
        </Reveal>

        <Reveal delay={120} className="lg:order-1">
          <RoutingMap />
        </Reveal>
      </section>

      {/* -------------------------------------------------------------- ADOPT */}
      {dogs.length > 0 && (
        <section>
          <Reveal className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Looking for a home</h2>
              <p className="mt-1 text-sm text-stone-500">
                Listed by approved NGOs and rescuers on this platform.
              </p>
            </div>
            <Link to="/adopt" className="text-sm font-semibold text-brand-700 hover:underline">
              See all dogs →
            </Link>
          </Reveal>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dogs.map((d, i) => (
              <Reveal key={d.id} delay={i * 90}>
                <Link
                  to={`/adopt/${d.id}`}
                  className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(174,36,85,0.34)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="aspect-4/3 overflow-hidden bg-brand-100">
                    {d.primaryMedia?.thumbnailUrl && (
                      <img
                        src={d.primaryMedia.thumbnailUrl}
                        alt={`${d.name}, ${withArticle(d.breed ?? 'dog')} available for adoption`}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold group-hover:text-brand-700">{d.name}</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {[ageLabel(d.ageMonths), d.breed].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.vaccinated && <Pill>vaccinated</Pill>}
                      {d.sterilized && <Pill>sterilised</Pill>}
                      {d.goodWith?.kids && <Pill>good with kids</Pill>}
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- TRANSPARENCY */}
      <section className="rounded-3xl border border-stone-200 bg-white p-8 sm:p-10">
        <Reveal className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Where the money goes</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-stone-500">
            Donations to the shared fund are disbursed to rescuers for specific treatment. Every
            payout is listed publicly, with the amount, the purpose and who received it.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            { label: 'Donated to the fund', value: fund?.fund?.raisedInr },
            { label: 'Paid out to rescuers', value: fund?.fund?.disbursedInr },
            { label: 'Balance held', value: fund?.fund?.balanceInr },
          ].map((stat, i) => (
            <Reveal key={stat.label} delay={i * 110} className="text-center">
              <CountUp
                value={stat.value}
                prefix="₹"
                className="block text-3xl font-bold tracking-tight text-brand-700 sm:text-4xl"
              />
              <p className="mt-1 text-sm text-stone-500">{stat.label}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <Link to="/donate" className="text-sm font-semibold text-brand-700 hover:underline">
            See the full ledger →
          </Link>
        </Reveal>
      </section>

      {/* ----------------------------------------------------------- CTA BAND */}
      <section className="paw-bg-light relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-14 text-center text-white sm:px-12">
        <Reveal className="relative">
          <h2 className="mx-auto max-w-[20ch] text-3xl font-bold tracking-tight">
            There is a dog on your street right now.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-brand-50">
            If they are hurt, sick or lost, this takes under a minute and reaches someone who can
            actually go.
          </p>
          <Link
            to="/report"
            className="mt-8 inline-block rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            Report a dog
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      {children}
    </span>
  );
}


/** "an Indian Pariah", "a Beagle" — screen readers do read the article. */
function withArticle(noun) {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

function ageLabel(months) {
  if (!Number.isFinite(months)) return null;
  if (months < 12) return `${months} months`;
  const y = Math.floor(months / 12);
  return `${y} year${y > 1 ? 's' : ''}`;
}
