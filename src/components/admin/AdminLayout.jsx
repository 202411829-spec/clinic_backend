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
    <div className="min-h-screen bg-gc-green md:flex">
      <Sidebar />

      <MobileSidebarOverlay
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* persistent green handle bar, mobile only — tap to open the menu */}
      <MobileMenuHandle onClick={() => setMobileNavOpen(true)} />

      {/* content panel — the rounded-left-corner cutout matches the desktop mock */}
      <div className="flex-1 bg-gray-50 md:rounded-tl-[48px] md:rounded-bl-[48px] min-h-screen overflow-hidden pb-10 md:pb-0">
        <Topbar user={currentUser} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="px-4 md:px-8 pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
