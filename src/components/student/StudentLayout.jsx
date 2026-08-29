// src/components/student/StudentLayout.jsx
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import StudentSidebar from "./StudentSidebar.jsx";
import StudentMobileSidebarOverlay from "./StudentMobileSidebarOverlay.jsx";
import Topbar from "../admin/Topbar.jsx";
import StudentMobileMenuHandle from "./StudentMobileMenuHandle.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { masterlistApi } from "../../lib/api.js";

// Builds the short "CCS BS Computer Science" style role label from the
// masterlist's full department/course names, e.g.
// "College of Computer Studies (CCS)" + "Bachelor of Science in Computer
// Science (BSCS)" -> "CCS BS Computer Science". Falls back gracefully if
// either field is missing so a partial profile still shows something useful.
function buildRoleLabel(profile) {
  if (!profile) return "";
  const deptAbbrev = profile.department_name?.match(/\(([^)]+)\)/)?.[1] ?? "";
  const course = (profile.course_name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return [deptAbbrev, course].filter(Boolean).join(" ");
}

export default function StudentLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { studentId } = useAuth();

  // Was previously hardcoded to a fixed name/role regardless of who was
  // actually logged in — now pulled from the real masterlist profile for
  // the current session, matching what the Student Record page shows.
  const [currentUser, setCurrentUser] = useState({ name: "", role: "" });

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    masterlistApi
      .getStudent(studentId)
      .then((profile) => {
        if (cancelled || !profile) return;
        const middle = profile.middle_initial ? ` ${profile.middle_initial}.` : "";
        setCurrentUser({
          name: `${profile.first_name ?? ""}${middle} ${profile.last_name ?? ""}`.trim(),
          role: buildRoleLabel(profile),
        });
      })
      .catch(() => {
        // No matching masterlist record for this login (e.g. an account
        // without a students row yet) — fall back to the username instead
        // of silently showing someone else's name.
        if (!cancelled) setCurrentUser({ name: studentId, role: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

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
