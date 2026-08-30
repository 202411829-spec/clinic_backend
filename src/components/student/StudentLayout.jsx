// src/components/student/StudentLayout.jsx
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import StudentSidebar from "./StudentSidebar.jsx";
import StudentMobileSidebarOverlay from "./StudentMobileSidebarOverlay.jsx";
import Topbar from "../admin/Topbar.jsx";
import StudentMobileMenuHandle from "./StudentMobileMenuHandle.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useProfileCompleteness } from "../../context/ProfileCompletenessContext.jsx";
import { masterlistApi } from "../../lib/api.js";

// The one student page that is always reachable — the rest (Dashboard / Book
// / Feedback) stay locked behind the complete-your-record gate below.
const RECORD_PATH = "/student/profile";

// Lightweight loader shown in the main pane while profile completeness is
// being determined, so the gate never flash-redirects blind before it knows.
function CompletenessLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <svg
        className="w-8 h-8 animate-spin text-gc-green"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <p className="text-sm font-semibold text-gray-400">Loading your profile…</p>
    </div>
  );
}

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
  const location = useLocation();
  const { status, checking, profileComplete } = useProfileCompleteness();

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

  // HARD GATE: while the record is incomplete the student may only reach the
  // Record page. Rendering <Navigate> here swaps the whole route (sidebar and
  // the child page) so Dashboard/Book/Feedback never even flash. The Record
  // page is exempted below so it is always reachable.
  if (!checking && status === "incomplete" && location.pathname !== RECORD_PATH) {
    return <Navigate to={RECORD_PATH} replace />;
  }

  return (
    <div className="min-h-screen md:h-screen bg-gc-student md:flex md:overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <StudentSidebar profileComplete={profileComplete} />

      <StudentMobileSidebarOverlay
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        profileComplete={profileComplete}
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
          {checking ? <CompletenessLoader /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
