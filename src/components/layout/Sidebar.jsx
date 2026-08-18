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
        <img src="/gordon-college-logo.png" alt="" className="h-12 w-12 object-contain" />
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

      <div className="bg-gc-green-800 px-4 py-4">
        <button className="flex items-center gap-3 text-[15px] font-semibold text-white/90">
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
