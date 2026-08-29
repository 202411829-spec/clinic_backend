// src/context/ProfileCompletenessContext.jsx
// Shared, cached "complete your record" gate state for the student portal.
//
// Completeness is derived (no DB column): a student's record is "complete"
// when the persistent profile fields the clinic needs are filled and at
// least one emergency contact exists (see src/lib/profileCompleteness.js).
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

const ProfileCompletenessContext = createContext(null);

export function ProfileCompletenessProvider({ children }) {
  const { studentId } = useAuth();
  const [status, setStatus] = useState("checking"); // "checking" | "complete" | "incomplete"
  const [loadError, setLoadError] = useState(null);

  // Monotonic sequence so a stale in-flight fetch can never override a
  // newer result (e.g. the mount fetch resolving AFTER the user saved).
  const seqRef = useRef(0);

  const applyProfile = useCallback((data) => {
    seqRef.current += 1;
    setLoadError(null);
    setStatus(isStudentProfileComplete(data) ? "complete" : "incomplete");
  }, []);

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
      const summary = await recordsApi.medicalSummary(studentId);
      if (seq !== seqRef.current) return "stale";
      setLoadError(null);
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
  }, [studentId]);

  useEffect(() => {
    if (!studentId) {
      seqRef.current += 1;
      setLoadError(null);
      setStatus("incomplete");
      return () => {};
    }

    setLoadError(null);
    setStatus("checking");
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    let cancelled = false;

    recordsApi
      .medicalSummary(studentId)
      .then((summary) => {
        if (cancelled || seq !== seqRef.current) return;
        setLoadError(null);
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
  }, [studentId]);

  const value = useMemo(
    () => ({
      status,
      checking: status === "checking",
      profileComplete: status === "complete",
      loadError,
      applyProfile,
      recheck,
    }),
    [status, loadError, applyProfile, recheck]
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