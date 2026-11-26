export function buildSafeProfilePatch(
  payload,
  medicalSummaryLoaded,
  includeConsent = false
) {
  const base = medicalSummaryLoaded
    ? { ...payload }
    : Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => key !== "emergency_contact" && key !== "medical_history"
        )
      )

  return includeConsent ? { ...base, data_privacy_consent: true } : base
}
