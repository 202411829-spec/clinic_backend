// src/pages/student/StudentRecord.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import StudentRecordPanel from "../../components/student/StudentRecordPanel.jsx";
import { masterlistApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useProfileCompleteness } from "../../context/ProfileCompletenessContext.jsx";
import { adaptStudent } from "../../lib/studentProfileAdapter.js";
import { createStudentProfileLoader } from "../../lib/studentProfileLoading.js";

export default function StudentRecord() {
  const { studentId } = useAuth();
  const {
    medicalSummary,
    medicalSummaryStudentId,
    loadMedicalSummary,
    retryMedicalSummary,
  } = useProfileCompleteness();

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [currentMedicalSummary, setCurrentMedicalSummary] = useState(null);
  const [medicalError, setMedicalError] = useState(null);
  const [medicalLoading, setMedicalLoading] = useState(true);

  const profileLoaderRef = useRef(null);
  const studentIdRef = useRef(studentId);
  studentIdRef.current = studentId;
  if (!profileLoaderRef.current) {
    profileLoaderRef.current = createStudentProfileLoader(masterlistApi.getStudent);
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
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((err) => {
        if (active) setProfileError(err?.message || "Failed to load your record");
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    let active = true;
    setMedicalError(null);

    if (!studentId) {
      setCurrentMedicalSummary(null);
      setMedicalLoading(false);
      return () => {
        active = false;
      };
    }

    setMedicalLoading(true);
    const sharedSummary = medicalSummaryStudentId === studentId ? medicalSummary : null;
    if (sharedSummary) {
      setCurrentMedicalSummary(sharedSummary);
      setMedicalLoading(false);
      return () => {
        active = false;
      };
    }

    loadMedicalSummary(studentId)
      .then(({ summary }) => {
        if (!active) return;
        setCurrentMedicalSummary(summary);
        setMedicalLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setMedicalError(err?.message || "Could not load medical details");
        setMedicalLoading(false);
      });

    return () => {
      active = false;
    };
  }, [studentId, medicalSummary, medicalSummaryStudentId, loadMedicalSummary]);

  const handleRetryMedicalSummary = useCallback(() => {
    const requestedStudentId = studentId;
    if (!requestedStudentId) return Promise.resolve();
    setMedicalLoading(true);
    setMedicalError(null);
    return retryMedicalSummary()
      .then((result) => {
        if (!result || studentIdRef.current !== requestedStudentId) return;
        setCurrentMedicalSummary(result.summary);
        setMedicalLoading(false);
      })
      .catch((err) => {
        if (studentIdRef.current !== requestedStudentId) return;
        setMedicalError(err?.message || "Could not load medical details");
        setMedicalLoading(false);
      });
  }, [studentId, retryMedicalSummary]);

  const student = useMemo(
    () => adaptStudent(profile, currentMedicalSummary),
    [profile, currentMedicalSummary]
  );

  return (
    <div className="pt-2 md:pt-4 max-w-6xl mx-auto">
      <StudentRecordPanel
        student={student}
        studentId={studentId}
        error={profileError}
        medicalSummaryError={medicalError}
        medicalSummaryLoading={medicalLoading}
        onRetryMedicalSummary={handleRetryMedicalSummary}
      />
    </div>
  );
}
