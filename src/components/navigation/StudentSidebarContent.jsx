// src/components/student/StudentSidebarContent.jsx
import { NavLink } from "react-router-dom";
import NavIcon from "../ui/NavIcon";
import LogoutMenu from "../auth/LogoutMenu";
import { studentMainNav } from "../../data/studentNav";

/**
 * Pure nav content (logo header + MAIN group) for the student portal.
 * Rendered by both StudentSidebar.jsx (desktop rail) and
 * StudentMobileSidebarOverlay.jsx (mobile sheet) so the two stay in sync.
 *
 * Logos are stacked above the brand text (rather than flanking it), same
 * layout pattern as the admin sidebar, so the two portals match at the
 * same w-64 sidebar width.
 */
export default function StudentSidebarContent({ onNavigate, profileComplete }) {
  // While the record is incomplete, the portal is hard-gated to the Record
  // page, so the nav must not lead students toward locked pages. Only the
  // Record item is offered until the gate lifts.
  const visibleNav = profileComplete
    ? studentMainNav
    : studentMainNav.filter((item) => item.to === "/student/record");
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col items-center gap-2.5 px-4 pt-6 pb-5 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <img
            src="/gordon-college-badge.png"
            alt="Gordon College seal"
            className="h-16 w-16 shrink-0 rounded-2xl object-contain"
          />
          <img
            src="/health-service-badge.png"
            alt="Health Service Unit seal"
            className="h-16 w-16 shrink-0 rounded-2xl object-contain"
          />
        </div>
        <div className="text-center leading-tight">
          <p className="text-white font-extrabold text-sm tracking-wide">
            GORDON COLLEGE
          </p>
          <p className="text-white/90 text-[11px] mt-0.5">Clinic Appointment System</p>
          <p className="text-white font-bold text-xs tracking-wide mt-0.5">
            STUDENT PORTAL
          </p>
        </div>
      </div>

      <div className="mx-4 h-px bg-white/15" />

      <nav className="flex-1 overflow-y-auto px-2 pt-5">
        <p className="px-4 text-[11px] font-bold tracking-wider text-white/60 uppercase mb-2">
          Main
        </p>
        {/* Sidebar mounts once per session (outside the routed <Outlet />),
            so a one-time staggered entrance for the nav items is basically
            free and only ever plays on first load — same pattern as the
            admin sidebar. Transform/opacity only, GPU-composited. */}
        <ul className="space-y-1">
          {visibleNav.map((item, i) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                style={{ animationDelay: `${i * 35}ms` }}
                className={({ isActive }) =>
                  [
                    "nav-rail flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-smooth animate-fade-in-up motion-reduce:animate-none",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white hover:translate-x-0.5",
                  ].join(" ")
                }
              >
                <NavIcon name={item.icon} className="w-[18px] h-[18px] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="px-2 pb-2">
        <div className="[&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-xl [&>button]:px-4 [&>button]:py-2.5 [&>button]:text-sm [&>button]:font-semibold [&>button]:text-white/75 [&>button]:transition-all [&>button]:duration-200 [&>button:hover]:bg-white/10 [&>button:hover]:text-white [&_svg]:h-[18px] [&_svg]:w-[18px]">
          <LogoutMenu redirectTo="/student/login" />
        </div>
      </div>

      <div className="border-t border-white/10">
        {profileComplete && (
          <NavLink
            to="/student/feedback"
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-6 py-3.5 text-sm font-semibold transition-all duration-200",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              ].join(" ")
            }
          >
            <NavIcon name="feedback" className="w-[18px] h-[18px]" />
            <span>Feedback</span>
          </NavLink>
        )}
        <NavLink
          to="/student/about"
          onClick={onNavigate}
          className="btn-press flex items-center gap-3 px-6 py-4 text-sm font-semibold text-white/75 transition-all duration-200 hover:bg-white/10 hover:text-white border-t border-white/10"
        >
          <NavIcon name="info" className="w-[18px] h-[18px]" />
          <span>About</span>
        </NavLink>
      </div>
    </div>
  );
}
