import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import EditStudentInfoModal from "../../components/student/EditStudentInfoModal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useProfileCompleteness } from "../../context/ProfileCompletenessContext.jsx";
import { masterlistApi } from "../../lib/api.js";
import { adaptStudent } from "../../lib/studentProfileAdapter.js";
import {
  createMedicalSummaryLoader,
  createStudentProfileLoader,
} from "../../lib/studentProfileLoading.js";
import { submitStudentProfilePatch } from "../../lib/studentProfileSave.js";

export default function ProfileEdit() {
  const navigate = useNavigate();
  const { studentId } = useAuth();
  const {
    medicalSummary,
    medicalSummaryStudentId,
    loadMedicalSummary,
    applyProfile,
  } = useProfileCompleteness();

  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const recordsApiMedicalSummary = useCallback(
    (id) => loadMedicalSummary(id).then(({ summary: loaded }) => loaded),
    [loadMedicalSummary]
  );

  const profileLoaderRef = useRef(null);
  const summaryLoaderRef = useRef(null);
  if (!profileLoaderRef.current) {
    profileLoaderRef.current = createStudentProfileLoader(masterlistApi.getStudent);
  }
  if (!summaryLoaderRef.current) {
    summaryLoaderRef.current = createMedicalSummaryLoader(recordsApiMedicalSummary);
  }

  useEffect(() => {
    let active = true;
    setProfile(null);
    setProfileError(null);

    if (!studentId) {
      setProfileError("Student account unavailable for this session.");
      return () => {
        active = false;
      };
    }

    profileLoaderRef.current
      .load(studentId)
      .then((data) => active && setProfile(data))
      .catch((err) => {
        if (active) setProfileError(err?.message || "Failed to load your record");
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    let active = true;
    setSummaryError(null);

    if (!studentId) {
      setSummary(null);
      return () => {
        active = false;
      };
    }

    const shared = medicalSummaryStudentId === studentId ? medicalSummary : null;
    if (shared) {
      setSummary(shared);
      return () => {
        active = false;
      };
    }

    setSummary(null);
    summaryLoaderRef.current
      .load(studentId)
      .then(({ summary: loaded }) => active && setSummary(loaded))
      .catch((err) => {
        if (active) setSummaryError(err?.message || "Could not load medical details");
      });

    return () => {
      active = false;
    };
  }, [studentId, medicalSummary, medicalSummaryStudentId]);

  useEffect(() => {
    if (!profile) return undefined;
    let active = true;

    masterlistApi
      .listDepartments()
      .then((depts) => {
        if (!active) return;
        setDepartments(depts || []);
        const current =
          (depts || []).find(
            (d) => String(d.department_id) === String(profile.department_id)
          ) ||
          (depts || []).find(
            (d) => d.department_name === profile.department_name
          );
        if (current) {
          masterlistApi
            .listCourses(current.department_id)
            .then((cs) => active && setCourses(cs || []))
            .catch(() => active && setCourses([]));
        }
      })
      .catch(() => active && setDepartments([]));

    return () => {
      active = false;
    };
  }, [profile]);

  const student = useMemo(
    () => adaptStudent(profile, summary),
    [profile, summary]
  );

  async function handleSave(payload, updatedStudent) {
    setSaveError(null);
    setIsSaving(true);
    try {
      const { complete, missing = [] } = await submitStudentProfilePatch(
        studentId,
        payload,
        (data) => flushSync(() => applyProfile(data))
      );
      if (!complete) {
        setSaveError(
          missing.length
            ? `Saved, but your record is still incomplete: ${missing.join(", ")}.`
            : "Some required information is still missing. Please review the form."
        );
        return;
      }
      navigate("/student/dashboard", { replace: true });
    } catch (err) {
      setSaveError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (profileError) {
    return (
      <div role="alert" className="rounded-panel bg-signal-rose-bg p-8 text-center text-sm text-signal-rose shadow-e1">
        {profileError}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your profile">
        <div className="h-36 animate-pulse rounded-panel bg-ink-100" />
        <div className="h-64 animate-pulse rounded-panel bg-ink-100/70" />
      </div>
    );
  }

  return (
    <div className="pt-2 md:pt-4 max-w-6xl mx-auto">
      {summaryError && (
        <div role="alert" className="mb-4 rounded-panel border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {summaryError} Only personal information will be saved until medical details load.
        </div>
      )}
      <EditStudentInfoModal
        student={student}
        departments={departments}
        courses={courses}
        onClose={() => navigate("/student/profile", { replace: true })}
        onSave={handleSave}
        isSaving={isSaving}
        saveError={saveError}
        onClearSaveError={() => setSaveError(null)}
        medicalSummaryLoaded={Boolean(summary)}
        onboarding
      />
    </div>
  );
}
