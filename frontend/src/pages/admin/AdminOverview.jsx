import { Link, useOutletContext } from 'react-router-dom';

/**
 * Every number here is a link. A count you cannot click is a dead end — if the
 * console says "2 awaiting review", the obvious next action is to see which two.
 */
function StatCard({ to, label, value, sub, tone }) {
  const toneCls =
    tone === 'alert'
      ? 'border-red-200 bg-red-50 hover:border-red-300'
      : tone === 'action'
        ? 'border-brand-200 bg-brand-50 hover:border-brand-300'
        : 'border-stone-200 bg-white hover:border-stone-300';

  return (
    <Link
      to={to}
      className={`group rounded-xl border p-4 transition-colors ${toneCls}`}
    >
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-stone-900">{value}</p>
      <p className="mt-1 text-xs text-stone-500 group-hover:text-stone-700">{sub} →</p>
    </Link>
  );
}

export default function AdminOverview() {
  const { stats } = useOutletContext();

  const pending = stats?.organizations?.pending ?? 0;
  const ngos = stats?.approvedByKind?.ngo ?? 0;
  const helpers = stats?.approvedByKind?.private_helper ?? 0;
  const urgent = stats?.urgentUnassigned ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-stone-500">
          Who can operate on the platform, and what needs attention today.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Needs your attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            to="/admin/applications"
            label="Applications awaiting review"
            value={pending}
            sub={pending ? 'Review them' : 'Nothing waiting'}
            tone={pending ? 'action' : null}
          />
          <StatCard
            to="/find?sort=urgency"
            label="Urgent reports with no rescuer"
            value={urgent}
            sub={urgent ? 'See which dogs' : 'All urgent cases assigned'}
            tone={urgent ? 'alert' : null}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Approved on the platform
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard to="/admin/ngos" label="NGOs" value={ngos} sub="View all NGOs" />
          <StatCard
            to="/admin/rescuers"
            label="Independent rescuers"
            value={helpers}
            sub="View all rescuers"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Reports
        </h2>
        <dl className="grid gap-3 sm:grid-cols-4">
          {[
            ['Open', stats?.reports?.open ?? 0],
            ['Assigned', stats?.reports?.assigned ?? 0],
            ['In treatment', stats?.reports?.in_treatment ?? 0],
            ['Resolved', stats?.reports?.resolved ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-stone-200 bg-white p-4">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="mt-1 text-2xl font-bold text-stone-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
