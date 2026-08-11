/**
 * One source of truth for how severity is shown. Colour alone is never the only
 * signal — every badge carries a label too, because a red/amber distinction is
 * invisible to a good share of users and this list is triage information.
 */
export const URGENCY = {
  5: { label: 'Critical', hex: '#dc2626', chip: 'bg-red-100 text-red-800 ring-red-600/20' },
  4: { label: 'Urgent', hex: '#ea580c', chip: 'bg-orange-100 text-orange-800 ring-orange-600/20' },
  3: { label: 'Needs care', hex: '#d97706', chip: 'bg-amber-100 text-amber-800 ring-amber-600/20' },
  2: { label: 'Monitor', hex: '#65a30d', chip: 'bg-lime-100 text-lime-800 ring-lime-600/20' },
  1: { label: 'Stable', hex: '#16a34a', chip: 'bg-green-100 text-green-800 ring-green-600/20' },
};

export const CONDITION_LABEL = {
  healthy: 'Healthy',
  injured: 'Injured',
  sick: 'Sick',
  critical: 'Critical',
};

export const STATUS_LABEL = {
  open: 'Awaiting help',
  assigned: 'Rescuer assigned',
  in_treatment: 'In treatment',
  resolved: 'Resolved',
  reunited: 'Reunited with owner',
  closed: 'Closed',
};

export function urgencyMeta(level) {
  return URGENCY[level] ?? URGENCY[1];
}

export function timeAgo(date) {
  const then = new Date(date).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
