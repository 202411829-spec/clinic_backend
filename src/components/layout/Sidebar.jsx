import { NavLink, useMatch, useResolvedPath } from 'react-router-dom'
import {
  DashboardIcon,
  AppointmentsIcon,
  LogbookIcon,
  MasterlistIcon,
  ClinicScheduleIcon,
  ReportsIcon,
  ShieldIcon,
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
  { to: '/admin/admins', label: 'Admins', Icon: ShieldIcon },
  { to: '/admin/profile', label: 'Profile', Icon: MasterlistIcon },
]

function NavItem({ to, label, Icon }) {
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: false })
  const isActive = !!match
  return (
    <NavLink
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={({ isActive: navIsActive }) =>
        [
          'group relative flex items-center gap-3 rounded-control px-3.5 py-2.5',
          'text-[15px] font-semibold',
          // Colour, background and the row's own resting position all ease
          // together on the same clock, so hovering feels like one motion
          // rather than a colour swap plus a separate nudge.
          'transition-[color,background-color,transform] duration-200 ease-out',
          'active:scale-[0.985]',
          navIsActive
            ? 'text-white'
            : 'text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white',
        ].join(' ')
      }
    >
      {({ isActive: navIsActive }) => (
        <>
          {navIsActive && (
            <>
              {/* White rail, not green — a green marker is invisible on a green
                  sidebar, which is why the original active state had to fill
                  the entire row in a lighter green just to be legible. It
                  grows in from its own centre on arrival rather than just
                  appearing, so switching pages reads as the rail travelling
                  to the new item. */}
              <span className="absolute left-0 top-1/2 h-6 w-[3px] origin-center -translate-y-1/2 rounded-r-full bg-white animate-rail-in" />
              <span className="absolute inset-0 rounded-control bg-white/[0.14] animate-fade-in" />
            </>
          )}
          <Icon className="relative h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110" />
          <span className="relative flex-1">{label}</span>
        </>
      )}
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

      <div className="border-t border-white/15 p-3">
        <div className="[&>button]:btn-press [&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-control [&>button]:px-3.5 [&>button]:py-2.5 [&>button]:text-[15px] [&>button]:font-semibold [&>button]:text-white/75 [&>button]:transition-colors [&>button]:duration-200 [&>button:hover]:bg-white/10 [&>button:hover]:text-white [&_svg]:h-5 [&_svg]:w-5 [&_svg]:transition-transform [&_svg]:duration-200 [&>button:hover_svg]:scale-110">
          <LogoutMenu redirectTo="/admin/login" />
        </div>
      </div>

      <div className="bg-gc-green-800 px-3 py-3">
        <button className="btn-press flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-white transition-all duration-200 hover:bg-white/5">
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
