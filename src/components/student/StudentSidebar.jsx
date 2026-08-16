// src/components/student/StudentSidebar.jsx
import StudentSidebarContent from "./StudentSidebarContent";

/**
 * Desktop-only fixed sidebar for the student portal. Hidden below the md
 * breakpoint; StudentMobileSidebarOverlay.jsx handles small screens instead.
 */
export default function StudentSidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-[220px] shrink-0 bg-gc-student h-screen sticky top-0 print:hidden">
      <StudentSidebarContent />
    </aside>
  );
}
