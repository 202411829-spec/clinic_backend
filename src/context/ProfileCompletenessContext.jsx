// src/context/ProfileCompletenessContext.jsx
// Shared, cached "complete your record" gate state for the student portal.
//
// Completeness is derived from persistent profile fields, an emergency
// contact, and the backend-owned `data_privacy_consented_at` timestamp
// (see src/lib/profileCompleteness.js).
// The source of truth is the same shape recordsApi.medicalSummary() returns
// — {profile, emergency_contact, ...} — which is fetched once here and
// reused by every student page, so navigating between pages never triggers a
// second fetch. applyProfile() lets the save flow update the result
// immediately from the PATCH echo so the gate lifts the moment the student
// finishes editing their record.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { recordsApi } from "../lib/api.js";
import { isStudentProfileComplete } from "../lib/profileCompleteness.js";
import { createMedicalSummaryLoader } from "../lib/studentProfileLoading.js";

const ProfileCompletenessContext = createContext(null);

export function ProfileCompletenessProvider({ children }) {
  const { studentId } = useAuth();
  const [status, setStatus] = useState("checking"); // "checking" | "complete" | "incomplete"
  const [loadError, setLoadError] = useState(null);
  const [medicalSummary, setMedicalSummary] = useState(null);
  const [medicalSummaryStudentId, setMedicalSummaryStudentId] = useState(null);

  // Monotonic sequence so a stale in-flight fetch can never override a
  // newer result (e.g. the mount fetch resolving AFTER the user saved).
  const seqRef = useRef(0);
  const summaryLoaderRef = useRef(null);
  const activeStudentIdRef = useRef(studentId);
  activeStudentIdRef.current = studentId;
  if (!summaryLoaderRef.current) {
    summaryLoaderRef.current = createMedicalSummaryLoader(recordsApi.medicalSummary);
  }

  const acceptMedicalSummary = useCallback((summaryStudentId, summary) => {
    summaryLoaderRef.current.setCached(summaryStudentId, summary);
    setMedicalSummary(summary);
    setMedicalSummaryStudentId(summaryStudentId);
  }, []);

  const loadMedicalSummary = useCallback(async (summaryStudentId, expectedSeq) => {
    const isCurrent = () =>
      expectedSeq != null &&
      activeStudentIdRef.current === summaryStudentId &&
      expectedSeq === seqRef.current;
    if (isCurrent()) setLoadError(null);
    try {
      const result = await summaryLoaderRef.current.load(summaryStudentId);
      if (isCurrent()) acceptMedicalSummary(summaryStudentId, result.summary);
      return result;
    } catch (err) {
      if (isCurrent()) setLoadError(err?.message || "Could not check your profile");
      throw err;
    }
  }, [acceptMedicalSummary]);

  const retryMedicalSummary = useCallback(async () => {
    if (!studentId) return null;
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setLoadError(null);
    const result = await loadMedicalSummary(studentId, seq);
    if (seq === seqRef.current) {
      setStatus(isStudentProfileComplete(result.summary) ? "complete" : "incomplete");
    }
    return result;
  }, [studentId, loadMedicalSummary]);

  const applyProfile = useCallback((data) => {
    seqRef.current += 1;
    setLoadError(null);
    acceptMedicalSummary(studentId, data);
    setStatus(isStudentProfileComplete(data) ? "complete" : "incomplete");
  }, [studentId, acceptMedicalSummary]);

  const recheck = useCallback(async () => {
    if (!studentId) {
      seqRef.current += 1;
      setLoadError(null);
      setStatus("incomplete");
      return "incomplete";
    }
    setLoadError(null);
    setStatus("checking");
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    try {
      const { summary } = await loadMedicalSummary(studentId, seq);
      if (seq !== seqRef.current) return "stale";
      setLoadError(null);
      setMedicalSummary(summary);
      setMedicalSummaryStudentId(studentId);
      const result = isStudentProfileComplete(summary) ? "complete" : "incomplete";
      setStatus(result);
      return result;
    } catch (err) {
      if (seq !== seqRef.current) return "stale";
      setLoadError(err?.message || "Could not check your profile");
      // Unknown is treated as incomplete: the student stays on the one page
      // that is always reachable until completeness can be proven again.
      setStatus("incomplete");
      return "incomplete";
    }
  }, [studentId, loadMedicalSummary]);

  useEffect(() => {
    if (!studentId) {
      seqRef.current += 1;
      setLoadError(null);
      setMedicalSummary(null);
      setMedicalSummaryStudentId(null);
      setStatus("incomplete");
      return () => {};
    }

    setLoadError(null);
    setStatus("checking");
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    let cancelled = false;

    loadMedicalSummary(studentId, seq)
      .then(({ summary }) => {
        if (cancelled || seq !== seqRef.current) return;
        setLoadError(null);
        setMedicalSummary(summary);
        setMedicalSummaryStudentId(studentId);
        setStatus(isStudentProfileComplete(summary) ? "complete" : "incomplete");
      })
      .catch((err) => {
        if (cancelled || seq !== seqRef.current) return;
        setLoadError(err?.message || "Could not check your profile");
        setStatus("incomplete");
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, loadMedicalSummary]);

  const value = useMemo(
    () => ({
      status,
      checking: status === "checking",
      profileComplete: status === "complete",
      loadError,
      medicalSummary,
      medicalSummaryStudentId,
      loadMedicalSummary,
      retryMedicalSummary,
      applyProfile,
      recheck,
    }),
    [
      status,
      loadError,
      medicalSummary,
      medicalSummaryStudentId,
      loadMedicalSummary,
      retryMedicalSummary,
      applyProfile,
      recheck,
    ]
  );

  return (
    <ProfileCompletenessContext.Provider value={value}>
      {children}
    </ProfileCompletenessContext.Provider>
  );
}

export function useProfileCompleteness() {
  const ctx = useContext(ProfileCompletenessContext);
  if (!ctx) {
    throw new Error("useProfileCompleteness must be used inside <ProfileCompletenessProvider>");
  }
  return ctx;
}