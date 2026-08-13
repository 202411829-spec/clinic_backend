// src/components/admin/Sidebar.jsx
import SidebarNav from "./SidebarNav";

/**
 * Desktop-only fixed sidebar. Hidden below the md breakpoint;
 * MobileSidebarOverlay.jsx handles small screens instead.
 */
export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-[220px] shrink-0 bg-gc-green h-screen sticky top-0 print:hidden">
      <SidebarNav />
    </aside>
  );
}
