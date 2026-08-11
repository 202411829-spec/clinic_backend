// src/components/admin/SidebarNav.jsx
import { NavLink } from "react-router-dom";
import NavIcon from "./NavIcon";
import { mainNav, managementNav } from "../../data/adminNav";

function NavGroup({ title, items, onNavigate }) {
  return (
    <div>
      <p className="px-4 text-[11px] font-semibold tracking-wider text-white/50 uppercase mb-2">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.to} className="relative">
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors overflow-hidden",
                  isActive
                    ? "bg-[#1E6C1A] text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                    : "text-white/85 hover:bg-white/10",
                ].join(" ")
              }
            >
              {({ isActive }) =>
                isActive ? (
                  <>
                    <span className="absolute inset-y-1.5 left-1 w-1.5 rounded-full bg-[#4FAD32]" />
                    <NavIcon name={item.icon} className="w-[18px] h-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </>
                ) : (
                  <>
                    <NavIcon name={item.icon} className="w-[18px] h-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pure nav content (logo header + MAIN + MANAGEMENT groups).
 * Rendered by both Sidebar.jsx (desktop rail) and MobileSidebarOverlay.jsx.
 */
export default function SidebarNav({ onNavigate }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0">
            <img
              src="/gordon-college-logo.png"
              alt="Gordon College seal"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0">
            <img
              src="/health-services-logo.png"
              alt="Health Services Unit seal"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        <div className="text-center leading-tight">
          <p className="text-white font-bold text-sm">GORDON COLLEGE</p>
          <p className="text-white/70 text-[11px]">Clinic Appointment System</p>
          <p className="text-white font-semibold text-xs tracking-wide mt-0.5">
            ADMIN PORTAL
          </p>
        </div>
      </div>

      <div className="mx-4 border-t border-white/15" />

      <nav className="flex-1 overflow-y-auto px-2 pt-5 space-y-7">
        <NavGroup title="Main" items={mainNav} onNavigate={onNavigate} />
        <NavGroup title="Management" items={managementNav} onNavigate={onNavigate} />
      </nav>

      <div className="px-2 pb-5 pt-3 border-t border-white/15 mx-2">
        <NavLink
          to="/admin/about"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
        >
          <NavIcon name="info" className="w-[18px] h-[18px]" />
          <span>About</span>
        </NavLink>
      </div>
    </div>
  );
}
