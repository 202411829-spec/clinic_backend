// src/components/ui/primitives.jsx
//
// The shared vocabulary every panel should be built from. The point of this
// file is that hierarchy lives in the primitive, not in each panel's class
// string — which is why the old build had ~40 copies of
// `bg-white rounded-2xl shadow-sm border border-gray-200` and no hierarchy.

const cx = (...parts) => parts.filter(Boolean).join(' ')

/* ── Panel ─────────────────────────────────────────────────────────────────
   The base surface. Note there is no `border` — the e2 shadow token carries
   its own hairline ring, so a panel never has a doubled edge. */
export function Panel({ children, className = '', ...rest }) {
  return (
    <section className={cx('overflow-hidden rounded-panel bg-white shadow-e2', className)} {...rest}>
      {children}
    </section>
  )
}

export function PanelHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ── Page header ───────────────────────────────────────────────────────────
   The serif is scoped to page titles and the printed letterhead only. It is
   what gives an institutional document its weight; used everywhere it would
   just be decoration. */
export function PageHeader({ title, meta, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink-900">{title}</h1>
        {meta && <p className="mt-1 text-base text-ink-500">{meta}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ── Button ───────────────────────────────────────────────────────────────── */
const VARIANTS = {
  primary: 'bg-brand-900 text-white shadow-e1 hover:bg-brand-800 active:bg-brand-950',
  secondary: 'border border-ink-200 bg-white text-ink-700 shadow-e1 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-signal-rose text-white shadow-e1 hover:brightness-95',
}
const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }) {
  return (
    <button
      className={cx(
        // btn-press carries the shared hover-lift/active-press motion (see
        // index.css) so every button in the app — regardless of variant —
        // settles and lifts on the same curve.
        'btn-press inline-flex items-center justify-center gap-1.5 rounded-control font-medium',
        'transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-45 disabled:hover:translate-y-0',
        VARIANTS[variant], SIZES[size], className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Status badge ──────────────────────────────────────────────────────────
   Dot + label on a low-chroma tint with an inset ring. Solid pastel pills
   (bg-green-100/text-green-700) read as consumer-app candy on a medical
   record; the dot also means status survives being printed in grayscale. */
const TONES = {
  positive: 'bg-brand-50 text-brand-800 ring-brand-200',
  warning: 'bg-signal-amber-bg text-signal-amber ring-signal-amber-ring',
  critical: 'bg-signal-rose-bg text-signal-rose ring-signal-rose-ring',
  neutral: 'bg-signal-slate-bg text-signal-slate ring-signal-slate-ring',
}
const DOTS = {
  positive: 'bg-brand-600',
  warning: 'bg-signal-amber',
  critical: 'bg-signal-rose',
  neutral: 'bg-signal-slate',
}

// Maps the statuses already used across Appointments / Logbook / Masterlist.
const STATUS_TONE = {
  Completed: 'positive', Seen: 'positive', Active: 'positive', Approved: 'positive',
  Pending: 'warning', Waiting: 'warning', 'In progress': 'warning',
  'No Show': 'critical', 'No show': 'critical', Rejected: 'critical', Expired: 'critical',
  Cancelled: 'neutral', Booked: 'neutral', Scheduled: 'neutral', Inactive: 'neutral',
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5',
      'text-2xs font-medium ring-1 ring-inset', TONES[tone], className
    )}>
      <i className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOTS[tone])} />
      {children}
    </span>
  )
}

// Drop-in replacement for the old StatusBadge — same `status` prop.
export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
}

/* ── Stat rail ─────────────────────────────────────────────────────────────
   One surface divided by hairlines rather than N floating cards. Four
   identical shadowed boxes is the tell-tale SaaS-card kit; a single divided
   plate reads as considered and takes less vertical space.

   Numbers are font-medium, not bold — at 34px, weight 500 with tabular figures
   looks far more expensive than weight 800. */
export function StatRail({ items = [] }) {
  const TONE_TEXT = {
    default: 'text-ink-900',
    positive: 'text-brand-700',
    warning: 'text-signal-amber',
    critical: 'text-signal-rose',
  }
  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-panel bg-white shadow-e2 sm:grid-cols-4 sm:divide-x sm:divide-ink-100">
      {items.map((it, i) => (
        <div key={it.label} className={cx('p-5', i < items.length - 2 && 'border-b border-ink-100 sm:border-b-0')}>
          <p className="text-xs font-medium text-ink-500">{it.label}</p>
          <p className={cx('tnum mt-1.5 text-3xl font-medium', TONE_TEXT[it.tone || 'default'])}>{it.value}</p>
          {it.hint && <p className="mt-1 text-xs text-ink-400">{it.hint}</p>}
        </div>
      ))}
    </section>
  )
}

/* ── Field ─────────────────────────────────────────────────────────────────── */
export function Field({ label, hint, error, id, className = '', ...rest }) {
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-600">{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={cx(
          'w-full rounded-control border bg-white px-3 py-2 text-sm text-ink-900',
          'placeholder:text-ink-400 focus:outline-none focus:ring-2',
          'disabled:bg-ink-50 disabled:text-ink-400',
          error
            ? 'border-signal-rose focus:border-signal-rose focus:ring-signal-rose/15'
            : 'border-ink-200 focus:border-brand-600 focus:ring-brand-600/15'
        )}
        {...rest}
      />
      {/* Errors state what happened and what to do — they don't apologise. */}
      {error ? (
        <p className="mt-1.5 text-xs text-signal-rose">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

/* ── Empty state ───────────────────────────────────────────────────────────
   An empty screen is an invitation to act, not a dead end — so it always
   carries the action that fills it. */
export function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-base font-medium text-ink-900">{title}</p>
      {body && <p className="mt-1 max-w-[42ch] text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
