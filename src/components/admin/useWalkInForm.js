// src/components/admin/useWalkInForm.js
// Shared hook for the "Add Walk-in Visit" form logic used by both the
// dashboard Logbook widget and the standalone Logbook page.
import { useState } from "react";
import {
  buildMedicineTag,
  buildWalkInPayload,
  isMedicalCertificateReason,
  validateWalkInPatientName,
  validateWalkInReason,
} from "../../lib/walkInForm.js";

export default function useWalkInForm({ reasonRecords = [], medicineRecords = [], onSubmit }) {
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [regId, setRegId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [suffix, setSuffix] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicineInput, setMedicineInput] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);
  const [walkInError, setWalkInError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetWalkInForm() {
    setRegId("");
    setReasonId("");
    setLastName("");
    setFirstName("");
    setMiddleInitial("");
    setSuffix("");
    setComplaint("");
    setMedicineInput("");
    setQuantity("");
    setMedTags([]);
    setWalkInError(null);
  }

  /** Reason drives whether complaint/medicine are applicable. */
  function handleReasonChange(nextReasonId) {
    setReasonId(nextReasonId);

    if (isMedicalCertificateReason(nextReasonId, reasonRecords)) {
      // Switching away from Consultation must not leave stale clinical data
      // in the form (or in the submitted payload).
      setComplaint("");
      setMedicineInput("");
      setQuantity("");
      setMedTags([]);
    }
    setWalkInError(null);
  }

  function handleAddMedicine() {
    if (isMedicalCertificateReason(reasonId, reasonRecords)) {
      setWalkInError(
        "Complaint and medicine are not used for Medical Certificate visits."
      );
      return;
    }

    const { tag, error } = buildMedicineTag({
      medicineInput,
      quantity,
      medicineRecords,
    });

    if (error) {
      setWalkInError(error);
      return;
    }
    if (!tag) return;

    setMedTags((tags) => [...tags, tag]);
    setMedicineInput("");
    setQuantity("");
    setWalkInError(null);
  }

  async function handleAddWalkIn() {
    // Guard against double-submits: without this, a slow request plus an
    // impatient double-click (or a fast double-tap on mobile) fires two
    // POSTs before the first one resolves, creating duplicate logbook rows.
    if (isSubmitting) return;

    const reasonError = validateWalkInReason(reasonId);
    if (reasonError) {
      setWalkInError(reasonError);
      return;
    }

    const validationError = validateWalkInPatientName({ lastName, firstName });
    if (validationError) {
      setWalkInError(validationError);
      return;
    }

    const payload = buildWalkInPayload({
      regId,
      reasonId,
      reasonRecords,
      lastName,
      firstName,
      middleInitial,
      suffix,
      complaint,
      medTags,
    });

    try {
      setIsSubmitting(true);
      setWalkInError(null);
      await onSubmit(payload);
    } catch (err) {
      setWalkInError(err.message || "Couldn't save the walk-in visit.");
      return;
    } finally {
      setIsSubmitting(false);
    }

    resetWalkInForm();
    setShowWalkInForm(false);
  }

  function handleClose() {
    setShowWalkInForm(false);
    resetWalkInForm();
  }

  return {
    showWalkInForm, setShowWalkInForm,
    regId, setRegId,
    reasonId,
    lastName, setLastName,
    firstName, setFirstName,
    middleInitial, setMiddleInitial,
    suffix, setSuffix,
    complaint, setComplaint,
    medicineInput, setMedicineInput,
    quantity, setQuantity,
    medTags,
    walkInError, setWalkInError,
    isSubmitting,
    handleReasonChange,
    handleAddMedicine,
    handleAddWalkIn,
    handleClose,
    resetWalkInForm,
  };
}
