// Pure helpers for the shared "Add Walk-in Visit" form.
// Kept separate from useWalkInForm so validation/payload behavior is testable
// without rendering React and so both the Logbook page and Dashboard widget
// inherit exactly the same rules.
import { formatPatientFormalName } from "./format.js";

export const MEDICAL_CERTIFICATE_REASON = "Medical Certificate";
export const CONSULTATION_REASON = "Consultation";

export function validateWalkInPatientName({ lastName = "", firstName = "" } = {}) {
  if (!String(lastName ?? "").trim()) return "Last name is required.";
  if (!String(firstName ?? "").trim()) return "First name is required.";
  return null;
}

export function validateWalkInReason(reasonId = "") {
  return String(reasonId ?? "").trim() ? null : "Reason is required.";
}

export function resolveReasonDescription(reasonId = "", reasonRecords = []) {
  const id = String(reasonId ?? "").trim();
  if (!id) return "";
  const match = (reasonRecords || []).find(
    (r) => String(r?.reason_id ?? "").trim() === id
  );
  return String(match?.description ?? "").trim();
}

/**
 * Medical Certificate visits are administrative only: complaint and medicine
 * fields are disabled and never submitted. Reason records come from the
 * existing reference API; no reason values are invented here.
 */
export function isMedicalCertificateReason(reasonId = "", reasonRecords = []) {
  return (
    resolveReasonDescription(reasonId, reasonRecords).toLowerCase() ===
    MEDICAL_CERTIFICATE_REASON.toLowerCase()
  );
}

/** Medicine quantity stays attached to one medicine entry and must be >= 1. */
export function normalizeMedicineQuantity(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 1;
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return quantity;
}

export function buildMedicineTag({
  medicineInput = "",
  quantity,
  medicineRecords = [],
} = {}) {
  const name = String(medicineInput ?? "").trim();
  if (!name) return { tag: null, error: null };

  const parsedQuantity = normalizeMedicineQuantity(quantity);
  if (!parsedQuantity) {
    return { tag: null, error: "Quantity must be 1 or more." };
  }

  const match = (medicineRecords || []).find(
    (m) =>
      String(m?.medicine_name ?? "").trim().toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    return { tag: null, error: "Medicine not found in the medicine list." };
  }

  return {
    tag: { name, quantity: parsedQuantity, medicine_id: match.medicine_id },
    error: null,
  };
}

export function buildWalkInPayload({
  regId = "",
  reasonId = "",
  reasonRecords = [],
  lastName = "",
  firstName = "",
  middleInitial = "",
  suffix = "",
  complaint = "",
  medTags = [],
  now = new Date(),
} = {}) {
  const studentId = String(regId ?? "").trim();
  const reasonIdText = String(reasonId ?? "").trim();
  const parsedReasonId = Number(reasonIdText);
  const clinicalFieldsDisabled = isMedicalCertificateReason(
    reasonIdText,
    reasonRecords
  );
  const complaintText = clinicalFieldsDisabled
    ? ""
    : String(complaint ?? "").trim();
  const medicines = clinicalFieldsDisabled
    ? []
    : (medTags || [])
        .filter((tag) => tag?.medicine_id)
        .map((tag) => ({
          medicine_id: tag.medicine_id,
          quantity: normalizeMedicineQuantity(tag.quantity) || 1,
        }));

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}:00`;

  return {
    ...(studentId ? { student_id: studentId } : {}),
    ...(reasonIdText && Number.isInteger(parsedReasonId)
      ? { reason_id: parsedReasonId }
      : {}),
    walk_in_name: formatPatientFormalName({
      last_name: lastName,
      first_name: firstName,
      middle_initial: middleInitial,
      suffix,
    }),
    appointment_date: `${y}-${m}-${d}`,
    appointment_time: time,
    ...(complaintText ? { complaint: complaintText } : {}),
    ...(medicines.length > 0 ? { medicines } : {}),
  };
}
