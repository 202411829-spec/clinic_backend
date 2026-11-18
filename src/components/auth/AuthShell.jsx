/**
 * Shared split-screen shell for every sign-in / sign-up screen.
 *  - lg+: brand panel (flat green) beside a floating form card
 *  - <lg: brand header above a bottom sheet
 */
export default function AuthShell({ brand, tone = 'admin', children, footer }) {
  return (
    <div className="app-shell app-shell--auth relative min-h-screen w-full overflow-hidden">
      {/* ── mobile / tablet ── */}
      <div className="relative flex min-h-screen flex-col lg:hidden">
        <div className="flex flex-col items-center px-6 pb-16 pt-14 text-center stagger">
          <img src={brand.logo} alt="Gordon College seal" className="h-[120px] w-[120px] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
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
          <div className="relative stagger flex flex-col items-center">
            <div className="relative">
              <img src={brand.logo} alt="Gordon College seal" className="relative h-[168px] w-[168px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]" />
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
