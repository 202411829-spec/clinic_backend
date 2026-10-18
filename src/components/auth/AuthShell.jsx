/**
 * Shared split-screen shell for every sign-in / sign-up screen.
 *  - lg+: brand panel (gradient, grid, drifting glows) beside a floating form card
 *  - <lg: brand header above a bottom sheet
 * `tone` only tints the ambient glow so admin and student portals feel related
 * but distinguishable.
 */
const GLOW = {
  admin: ['bg-brand-500/30', 'bg-gold-400/15'],
  student: ['bg-brand-500/40', 'bg-gold-400/20'],
}

export default function AuthShell({ brand, tone = 'admin', children, footer }) {
  const [g1, g2] = GLOW[tone] ?? GLOW.admin
  return (
    <div className={`app-shell ${tone === 'student' ? 'app-shell--student' : ''} relative min-h-screen w-full overflow-hidden`}>
      {/* ambient orbs */}
      <div aria-hidden className={`pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full blur-3xl animate-float-slow ${g1}`} />
      <div aria-hidden className={`pointer-events-none absolute bottom-[-6rem] left-1/3 h-80 w-80 rounded-full blur-3xl animate-float-slow [animation-delay:-6s] ${g2}`} />

      {/* ── mobile / tablet ── */}
      <div className="relative flex min-h-screen flex-col lg:hidden">
        <div className="flex flex-col items-center px-6 pb-16 pt-14 text-center stagger">
          <img src={brand.logo} alt="Gordon College seal" className="h-[120px] w-[120px] rounded-[28px] object-cover shadow-float ring-1 ring-white/10" />
          <h1 className="mt-6 font-serif text-2xl font-semibold tracking-wide text-white">{brand.name}</h1>
          <p className="mt-1 text-[15px] text-white/75">{brand.tagline}</p>
        </div>
        <div className="-mt-8 flex-1 rounded-t-[32px] bg-white px-6 pb-10 pt-10 shadow-float sm:px-10 animate-fade-up [animation-delay:120ms]">
          <div className="mx-auto w-full max-w-sm">{children}</div>
          {footer}
        </div>
      </div>

      {/* ── desktop ── */}
      <div className="relative hidden h-screen w-full lg:flex">
        <div className="relative flex w-[42%] shrink-0 flex-col items-center justify-center px-12 text-center">
          <div aria-hidden className="bg-grid absolute inset-0" />
          <div className="relative stagger flex flex-col items-center">
            <div className="relative">
              <span aria-hidden className="absolute -inset-6 rounded-full bg-gold-400/10 blur-2xl" />
              <img src={brand.logo} alt="Gordon College seal" className="relative h-[168px] w-[168px] rounded-[36px] object-cover shadow-float ring-1 ring-white/10" />
            </div>
            <h1 className="mt-8 font-serif text-3xl font-semibold tracking-wide text-white">{brand.name}</h1>
            <span className="mt-3 h-[3px] w-12 origin-left rounded-full bg-gold-400 animate-grow-x [animation-delay:400ms]" />
            <p className="mt-3 text-sm text-white/70">{brand.tagline}</p>
          </div>
        </div>

        <div className="my-3 mr-3 flex flex-1 items-center justify-center rounded-[28px] bg-canvas px-10 shadow-float">
          <div className="w-full max-w-md rounded-[20px] bg-white p-10 shadow-e3 animate-fade-up [animation-delay:150ms]">
            {children}
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}
