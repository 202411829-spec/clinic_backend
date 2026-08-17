// src/components/admin/AdminLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileSidebarOverlay from "./MobileSidebarOverlay";
import MobileMenuHandle from "./MobileMenuHandle";

// TODO: replace with the logged-in admin from your Supabase session /
// auth context once that's wired up. Hardcoded for now so the layout
// matches the mockup out of the box.
const currentUser = { name: "Joseph Daniel B. Ramos", role: "Nurse" };

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen md:h-screen bg-gc-green md:flex md:overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <Sidebar />

      <MobileSidebarOverlay
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* persistent green handle bar, mobile only — tap to open the menu */}
      <MobileMenuHandle onClick={() => setMobileNavOpen(true)} />

      {/* content panel — the rounded-left-corner cutout matches the desktop mock.
          On desktop this column owns its own scroll (md:overflow-y-auto) so the
          page itself never scrolls — only this panel does, matching the Figma mock.
          On print, the scroll container is neutralized (print:h-auto/overflow-visible)
          so printed content flows across pages normally instead of being clipped
          to whatever fit in the on-screen scroll viewport. */}
      <div className="flex-1 bg-gray-50 md:rounded-tl-[48px] md:rounded-bl-[48px] min-h-screen md:h-screen md:overflow-y-auto overflow-hidden pb-10 md:pb-0 print:h-auto print:overflow-visible print:rounded-none print:bg-white print:pb-0">
        <Topbar user={currentUser} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="px-4 md:px-8 pb-10 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
