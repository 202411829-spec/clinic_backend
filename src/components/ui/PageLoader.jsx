/** Full-screen fallback shown while a lazy route chunk downloads. */
export default function PageLoader({ label = 'Loading' }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="app-shell grid min-h-screen place-items-center animate-fade-in"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/20" />
          <span className="absolute inset-0 rounded-full border-2 border-white/10 border-t-gold-400 animate-spin" />
          <img src="/gordon-college-logo.png" alt="" className="h-11 w-11 object-contain" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">{label}</p>
      </div>
    </div>
  )
}

/** In-layout fallback: only the content area shows it, the sidebar stays put. */
export function ContentLoader() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5 py-2 animate-fade-in">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="skeleton h-72 w-full !rounded-panel" />
    </div>
  )
}
