import { NavLink } from 'react-router-dom'
import {
  DashboardIcon,
  AppointmentsIcon,
  LogbookIcon,
  MasterlistIcon,
  ClinicScheduleIcon,
  ReportsIcon,
  InfoIcon,
} from '../icons.jsx'
import LogoutMenu from '../LogoutMenu.jsx'

const MAIN_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/admin/appointments', label: 'Appointments', Icon: AppointmentsIcon },
  { to: '/admin/logbook', label: 'Logbook', Icon: LogbookIcon },
  { to: '/admin/masterlist', label: 'Masterlist', Icon: MasterlistIcon },
]

const MANAGEMENT_ITEMS = [
  { to: '/admin/clinic-schedule', label: 'Clinic Schedule', Icon: ClinicScheduleIcon },
  { to: '/admin/reports', label: 'Reports', Icon: ReportsIcon },
]

function NavItem({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-white transition-colors ${
          isActive ? 'bg-gc-green-600' : 'hover:bg-white/5'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  )
}

function NavContent() {
  return (
    <>
      <div className="flex flex-col items-center px-4 pb-5 pt-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <img src="/gordon-college-logo.png" alt="Gordon College seal" className="h-16 w-16 object-contain" />
          {/* health-services-logo.png has more padding baked into the source
              file than gordon-college-logo.png, so the seal itself renders
              visibly smaller at the same box size. Scaling it up slightly
              makes the two seals read as the same size side by side. */}
          <img
            src="/health-services-logo.png"
            alt="Health Services Unit seal"
            className="h-16 w-16 object-contain scale-[1.08]"
          />
        </div>
        <p className="mt-2 text-sm font-extrabold leading-tight text-white">GORDON COLLEGE</p>
        <p className="text-[11px] leading-tight text-white/80">Clinic Appointment System</p>
        <p className="mt-2 text-xs font-bold tracking-widest text-white">ADMIN PORTAL</p>
        <div className="mt-4 h-px w-full bg-white/20" />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div>
          <p className="px-4 pb-2 text-xs font-bold tracking-widest text-white/70">MAIN</p>
          <div className="space-y-1">
            {MAIN_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>
        <div>
          <p className="px-4 pb-2 text-xs font-bold tracking-widest text-white/70">MANAGEMENT</p>
          <div className="space-y-1">
            {MANAGEMENT_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>
      </nav>

      <div className="px-3 pb-2">
        <div className="[&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-xl [&>button]:px-4 [&>button]:py-3 [&>button]:text-[15px] [&>button]:font-semibold [&>button]:text-white [&>button]:transition-colors [&>button:hover]:bg-white/5 [&_svg]:h-5 [&_svg]:w-5">
          <LogoutMenu redirectTo="/admin/login" />
        </div>
      </div>

      <div className="bg-gc-green-800 px-3 py-3">
        <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/5">
          <InfoIcon className="h-5 w-5" />
          About
        </button>
      </div>
    </>
  )
}

export default function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col bg-gc-green-700 lg:flex">
      <NavContent />
    </aside>
  )
}
