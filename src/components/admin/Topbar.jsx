// src/components/admin/Topbar.jsx
import NavIcon from "./NavIcon";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * user: { name: string, role: string }
 * onBack: optional handler for the "Back" link (defaults to browser back)
 * onMenuClick: opens the mobile sidebar overlay
 */
export default function Topbar({ user, onBack, onMenuClick }) {
  const handleBack = onBack ?? (() => window.history.back());

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 bg-white">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-gc-green font-semibold text-sm hover:opacity-75"
        >
          <NavIcon name="back" className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* desktop: plain name + role, no chip */}
      <div className="hidden md:block text-right leading-tight">
        <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
        <p className="text-xs font-medium text-gc-accent">{user?.role}</p>
      </div>

      {/* mobile: rounded chip with avatar, matches the mockup */}
      <div className="md:hidden flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-full pl-3 pr-1.5 py-1.5">
        <div className="text-right leading-tight">
          <p className="text-xs font-semibold text-gray-800">{user?.name}</p>
          <p className="text-[10px] font-medium text-gc-accent">{user?.role}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-gc-green text-white text-xs font-bold flex items-center justify-center">
          {initials(user?.name)}
        </div>
      </div>
    </header>
  );
}
