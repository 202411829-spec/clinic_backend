// src/components/primitives.jsx
//
// REQUIRED import path for shared visual elements. Cards, buttons, badges,
// fields, page headers and error messages are built from here — not copied
// into a page as a class string. This file exists because the old build ended
// up with ~40 copies of
// `bg-white rounded-2xl shadow-sm border border-gray-200`
// and no hierarchy: the fix was written once, never adopted, and the
// duplication regrew. Importing from here instead of retyping the classes is
// what stops that happening again.
//
// Pass 1 palette: `gc-green` for primary actions, `gray-*` for chrome,
// borders and text — the tokens the majority of the app already uses, so a
// primitive dropped into a page renders the same pixels as the markup it
// replaces. The `brand` / `ink` / `signal` palette is Pass 2; don't add it.
//
// Note: `PanelHeader` and `StatRail` are pre-existing exports with no
// importers yet. They still carry Pass 2 tokens and are kept until the
// deferred cleanup removes them — do not build new pages on them.
// `StatusBadge` is dead for the same reason: status pills on the dashboard
// still come from `components/admin/StatusBadge.jsx`, and swapping that over
// is a visual change (solid pastel pill -> dot + inset ring), so it waits for
// Pass 2 along with the rest of them.

const cx = (...parts) => parts.filter(Boolean).join(' ')

/* ── Panel ─────────────────────────────────────────────────────────────────
   The card surface: radius, hairline width and shadow live here so no page has
   to restate them. Everything a card shades or spaces differently stays at the
   call site:

     - padding (p-4, p-5, p-8) — cards size their content differently and one
       baked-in padding would fight every other caller;
     - hairline colour (`border-gray-100` on Masterlist, `border-gray-200` on
       the dashboard widgets) — the existing cards disagree, and baking either
       shade in would shift the other one a pixel, which Pass 1 forbids. Every
       call site therefore passes its own `border-gray-*`; Pass 2 unifies them
       and moves the winner back in here.

   No background either: admin pages sit on a white page (see AdminLayout), so
   the hairline and shadow are what separate the card from it. */
export function Panel({ children, className = '', ...rest }) {
  return (
    <section className={cx('rounded-2xl border shadow-sm', className)} {...rest}>
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
   The one admin page header: icon, uppercase title, one-line description and
   an optional right-aligned `actions` slot for page-level buttons (the
   Requests/New Admin pair on the Admins page is the case that needs it).

   The title text is written in upper case by the caller — it is the page's
   name, not a sentence — and `uppercase` on the h1 enforces that in CSS, so a
   caller cannot drift the single admin title style into sentence case.

   `icon` is optional. With ~13 admin headers coming and no app-wide error
   boundary, a header that forgot its icon must still render a title rather
   than throw on a missing component.

   `className` carries page-level spacing (pt-2 and friends) so the header
   itself stays identical on every admin page. */
export function PageHeader({ icon: Icon, title, description, actions, className = '' }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-gc-accent" />}
          <h1 className="text-lg font-extrabold tracking-wide uppercase text-gray-900">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
    </div>
  )
}

/* ── Button ───────────────────────────────────────────────────────────────── */
const VARIANTS = {
  primary: 'bg-gc-green text-white hover:opacity-90',
  secondary: 'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100',
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
  positive: 'bg-gc-green-50 text-gc-green-800 ring-gc-green-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  critical: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
}
const DOTS = {
  positive: 'bg-gc-green-600',
  warning: 'bg-amber-600',
  critical: 'bg-red-600',
  neutral: 'bg-gray-500',
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
      {label && <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={cx(
          'w-full rounded-control border bg-white px-3 py-2 text-sm text-gray-900',
          'placeholder:text-gray-400 focus:outline-none focus:ring-2',
          'disabled:bg-gray-50 disabled:text-gray-400',
          error
            ? 'border-red-600 focus:border-red-600 focus:ring-red-600/20'
            : 'border-gray-200 focus:border-gc-green-700 focus:ring-gc-green-700/20'
        )}
        {...rest}
      />
      {/* Errors state what happened and what to do — they don't apologise. */}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
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
      <p className="text-base font-medium text-gray-900">{title}</p>
      {body && <p className="mt-1 max-w-[42ch] text-sm text-gray-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ── Error banner ─────────────────────────────────────────────────────────
   The inline failure message that sits under the thing that failed. Renders
   nothing when there is no error, so a page can hand its error state straight
   in without guarding around it. Vertical spacing is the call site's, same as
   Panel's padding: a banner under a filter row wants mt-4, one under a table
   wants something else. */
export function ErrorBanner({ message, className = '' }) {
  if (!message) return null
  return <p className={cx('text-sm font-medium text-red-600', className)}>{message}</p>
}
