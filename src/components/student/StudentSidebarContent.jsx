// src/components/student/StudentSidebarContent.jsx
import { NavLink, useNavigate } from "react-router-dom";
import NavIcon from "../admin/NavIcon";
import LogoutMenu from "../LogoutMenu";
import { studentMainNav } from "../../data/studentNav";
import { useAuth } from "../../context/AuthContext";

/**
 * Pure nav content (logo header + MAIN group) for the student portal.
 * Rendered by both StudentSidebar.jsx (desktop rail) and
 * StudentMobileSidebarOverlay.jsx (mobile sheet) so the two stay in sync.
 *
 * Logos are stacked above the brand text (rather than flanking it) because
 * the fixed 220px sidebar isn't wide enough to fit two logos + "GORDON
 * COLLEGE" / "STUDENT PORTAL" side-by-side without the text wrapping.
 * Stacking gives the text the full width, so it stays on one line each
 * and stays readable.
 */
export default function StudentSidebarContent({ onNavigate }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await signOut();
    } finally {
      navigate("/student/login");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col items-center gap-2.5 px-4 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <img
            src="/gordon-college-badge.png"
            alt="Gordon College seal"
            className="h-16 w-16 shrink-0 object-contain"
          />
          <img
            src="/health-service-badge.png"
            alt="Health Service Unit seal"
            className="h-16 w-16 shrink-0 object-contain"
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

      <div className="mx-4 border-t border-white/30" />

      <nav className="flex-1 overflow-y-auto px-2 pt-5">
        <p className="px-4 text-[11px] font-bold tracking-wider text-white/80 uppercase mb-2">
          Main
        </p>
        <ul className="space-y-1">
          {studentMainNav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-gc-green text-white shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                      : "text-white/95 hover:bg-black/10",
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
        <div className="[&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-xl [&>button]:px-4 [&>button]:py-2.5 [&>button]:text-sm [&>button]:font-semibold [&>button]:text-white/95 [&>button]:transition-colors [&>button:hover]:bg-black/10 [&_svg]:h-[18px] [&_svg]:w-[18px]">
          <LogoutMenu redirectTo="/student/login" />
        </div>
      </div>

      <div className="border-t border-white/20">
        <NavLink
          to="/student/feedback"
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              "flex items-center gap-3 px-6 py-3.5 text-sm font-semibold transition-colors",
              isActive
                ? "bg-gc-green text-white"
                : "text-white/95 bg-gc-green-800 hover:bg-gc-green-900",
            ].join(" ")
          }
        >
          <NavIcon name="feedback" className="w-[18px] h-[18px]" />
          <span>Feedback</span>
        </NavLink>
        <NavLink
          to="/student/about"
          onClick={onNavigate}
          className="flex items-center gap-3 bg-gc-green-800 px-6 py-4 text-sm font-semibold text-white hover:bg-gc-green-900 border-t border-white/10"
        >
          <NavIcon name="info" className="w-[18px] h-[18px]" />
          <span>About</span>
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 bg-gc-green-800 px-6 py-4 text-sm font-semibold text-white hover:bg-gc-green-900 border-t border-white/10"
        >
          <NavIcon name="logout" className="w-[18px] h-[18px]" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}
