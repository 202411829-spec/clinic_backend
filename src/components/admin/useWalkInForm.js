// src/components/admin/useWalkInForm.js
// Shared hook for the "Add Walk-in Visit" form logic used by both the
// dashboard Logbook widget and the standalone Logbook page.
import { useState } from "react";

export default function useWalkInForm({ reasonRecords, medicineRecords, onSubmit }) {
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [regId, setRegId] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInReasonId, setWalkInReasonId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicineInput, setMedicineInput] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);
  const [walkInError, setWalkInError] = useState(null);

  function resetWalkInForm() {
    setRegId("");
    setWalkInName("");
    setWalkInReasonId("");
    setComplaint("");
    setMedicineInput("");
    setQuantity("");
    setMedTags([]);
    setWalkInError(null);
  }

  function handleAddMedicine() {
    if (!medicineInput.trim()) return;
    const qty = quantity ? Number(quantity) : 1;
    const match = medicineRecords.find(
      (m) => m.medicine_name.toLowerCase() === medicineInput.trim().toLowerCase()
    );
    const medId = match?.medicine_id;
    setMedTags((tags) => [
      ...tags,
      { name: medicineInput.trim(), quantity: qty, medicine_id: medId },
    ]);
    setMedicineInput("");
    setQuantity("");
  }

  async function handleAddWalkIn() {
    if ((!regId.trim() && !walkInName.trim()) || !walkInReasonId) return;

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}:00`;

    const medicinesPayload = medTags
      .filter((t) => t.medicine_id)
      .map((t) => ({ medicine_id: t.medicine_id, quantity: t.quantity }));

    try {
      setWalkInError(null);
      await onSubmit({
        student_id: regId.trim() || undefined,
        walk_in_name: walkInName.trim() || undefined,
        appointment_date: `${y}-${m}-${d}`,
        appointment_time: time,
        reason_id: Number(walkInReasonId),
        complaint: complaint.trim() || undefined,
        medicines: medicinesPayload.length > 0 ? medicinesPayload : undefined,
      });
    } catch (err) {
      setWalkInError(err.message || "Couldn't save the walk-in visit.");
      return;
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
    walkInName, setWalkInName,
    walkInReasonId, setWalkInReasonId,
    complaint, setComplaint,
    medicineInput, setMedicineInput,
    quantity, setQuantity,
    medTags,
    walkInError, setWalkInError,
    handleAddMedicine,
    handleAddWalkIn,
    handleClose,
    resetWalkInForm,
  };
}
