import { Link } from 'react-router-dom'

const BRAND = {
  logo: '/gordon-college-seal.png',
  name: 'GORDON COLLEGE',
  tagline: 'Clinic Appointment System',
}

export default function SignUpLayout({ portalLabel, title, subtitle, loginTo, footer, children }) {
  const cardFooter = footer ?? (
    <p className="mt-6 text-center text-sm text-gray-600">
      Already have an account?{' '}
      <Link to={loginTo} className="font-semibold text-gc-green-700 hover:text-gc-green-800">
        Log in
      </Link>
    </p>
  )

  const card = (
    <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl shadow-black/5 animate-fade-in-up motion-reduce:animate-none">
      <p className="text-xs font-bold tracking-[0.15em] text-gc-green-700 uppercase">{portalLabel}</p>
      <h1 className="mt-2 text-2xl font-extrabold text-gc-green-700">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      {children}
      {cardFooter}
    </div>
  )

  return (
    <div className="min-h-screen w-full bg-gc-green-700">
      <div className="flex min-h-screen flex-col lg:hidden">
        <div className="flex flex-col items-center px-6 pt-14 pb-16">
          <img src={BRAND.logo} alt="Gordon College seal" className="h-[140px] w-[140px] object-contain" />
          <h1 className="mt-6 text-2xl font-extrabold tracking-wide text-white">{BRAND.name}</h1>
          <p className="mt-1 text-[15px] text-white/90">{BRAND.tagline}</p>
        </div>
        <div className="-mt-8 flex-1 rounded-t-panel bg-white px-6 pb-10 pt-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm">{card}</div>
        </div>
      </div>

      <div className="hidden h-screen w-full overflow-hidden lg:flex">
        <div className="flex h-[calc(100%-4px)] w-full">
          <div className="flex w-[31%] shrink-0 flex-col items-center justify-center">
            <img src={BRAND.logo} alt="Gordon College seal" className="h-[155px] w-[155px] object-contain" />
            <h1 className="mt-5 text-xl font-extrabold tracking-wide text-white">{BRAND.name}</h1>
            <p className="mt-1 text-sm text-white/90">{BRAND.tagline}</p>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-tl-[5rem] rounded-bl-[5rem] bg-white px-10">
            <div className="w-full max-w-md">{card}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
