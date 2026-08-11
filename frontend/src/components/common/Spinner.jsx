export default function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-stone-500 ${className}`}>
      <span
        className="size-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600"
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
