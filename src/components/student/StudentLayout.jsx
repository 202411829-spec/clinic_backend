// src/components/student/StudentLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import StudentSidebar from "./StudentSidebar";
import StudentMobileSidebarOverlay from "./StudentMobileSidebarOverlay";
import Topbar from "../admin/Topbar";
import StudentMobileMenuHandle from "./StudentMobileMenuHandle";

// TODO: replace with the logged-in student from your Supabase session /
// auth context once that's wired up. Hardcoded for now so the layout
// matches the mockup out of the box.
const currentUser = { name: "Joseph Daniel B. Ramos", role: "CCS BS Computer Science" };

export default function StudentLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen md:h-screen bg-gc-student md:flex md:overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <StudentSidebar />

      <StudentMobileSidebarOverlay
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <StudentMobileMenuHandle onClick={() => setMobileNavOpen(true)} />

      <div className="flex-1 bg-gray-50 md:rounded-tl-[48px] md:rounded-bl-[48px] min-h-screen md:h-screen md:overflow-y-auto overflow-hidden pb-10 md:pb-0 print:h-auto print:overflow-visible print:rounded-none print:bg-white print:pb-0">
        <Topbar
          user={currentUser}
          onMenuClick={() => setMobileNavOpen(true)}
          logoutRedirect="/student/login"
          showLogout={false}
        />
        <main className="px-4 md:px-8 pb-10 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
