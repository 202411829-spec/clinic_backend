import { NavLink } from 'react-router-dom'
import {
  DashboardIcon,
  AppointmentsIcon,
  LogbookIcon,
  MasterlistIcon,
  ClinicScheduleIcon,
  ReportsIcon,
  ShieldIcon,
} from '../icons.jsx'
import LogoutMenu from '../LogoutMenu.jsx'

// Back on the Gordon College green (#044B0E) instead of the near-black shell.
// To keep it from going flat the way the original did, the refinement moves
// into contrast and weight rather than hue: inactive labels sit at 75% white
// (not 55%), the active row gets a white rail plus a light plate, and type is
// back up to 15px with 20px icons so the rail is comfortable to read all day.

const MAIN_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/admin/appointments', label: 'Appointments', Icon: AppointmentsIcon },
  { to: '/admin/logbook', label: 'Logbook', Icon: LogbookIcon },
  { to: '/admin/masterlist', label: 'Masterlist', Icon: MasterlistIcon },
]

const MANAGEMENT_ITEMS = [
  { to: '/admin/clinic-schedule', label: 'Clinic schedule', Icon: ClinicScheduleIcon },
  { to: '/admin/reports', label: 'Reports', Icon: ReportsIcon },
  { to: '/admin/admins', label: 'Admins', Icon: ShieldIcon },
]

function NavItem({ to, label, Icon, count }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-control px-3.5 py-2.5',
          'text-[15px] font-semibold',
          // Colour, background and the row's own resting position all ease
          // together on the same clock, so hovering feels like one motion
          // rather than a colour swap plus a separate nudge.
          'transition-[color,background-color,transform] duration-200 ease-out',
          'active:scale-[0.985]',
          isActive
            ? 'text-white'
            : 'text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
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
          {count != null && (
            <span className="tnum relative rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white transition-transform duration-200 ease-out group-hover:scale-105">
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function NavContent({ todayCount }) {
  return (
    <>
      <div className="px-5 pb-6 pt-7">
        <div className="flex items-center gap-3">
          {/* No tile/plate behind the seal — it sits straight on the sidebar
              green so the seal's own colour reads as part of the brand
              surface instead of sitting in a separate white/tinted box. */}
          <img src="/gordon-college-logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="font-serif text-[19px] font-semibold leading-tight text-white">Gordon College</p>
            <p className="truncate text-[13px] leading-tight text-white/70">Health Services Unit</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <div className="space-y-1">
          {MAIN_ITEMS.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              count={item.label === 'Appointments' ? todayCount : undefined}
            />
          ))}
        </div>

        <p className="px-3.5 pb-2 pt-7 text-[13px] font-semibold text-white/55">Management</p>
        <div className="space-y-1">
          {MANAGEMENT_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-white/15 p-3">
        <div className="[&>button]:btn-press [&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-control [&>button]:px-3.5 [&>button]:py-2.5 [&>button]:text-[15px] [&>button]:font-semibold [&>button]:text-white/75 [&>button]:transition-colors [&>button]:duration-200 [&>button:hover]:bg-white/10 [&>button:hover]:text-white [&_svg]:h-5 [&_svg]:w-5 [&_svg]:transition-transform [&_svg]:duration-200 [&>button:hover_svg]:scale-110">
          <LogoutMenu redirectTo="/admin/login" />
        </div>
      </div>
    </>
  )
}

export default function Sidebar({ todayCount }) {
  return (
    <aside className="hidden h-screen w-[264px] shrink-0 flex-col bg-brand-900 lg:flex">
      <NavContent todayCount={todayCount} />
    </aside>
  )
}

export { NavContent }
