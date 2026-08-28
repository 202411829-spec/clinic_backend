// src/components/student/SelectReasonPanel.jsx
import { useEffect, useState } from "react";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";

/**
 * reasons: array of { reason_id, description }
 * reasonId: selected reason_id (number)
 * onSelectReason: (reasonId: number) => void
 */
export default function SelectReasonPanel({ reasons, reasonId, onSelectReason }) {
  // If reasons aren't loaded yet, show a loading state
  if (!reasons || reasons.length === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
        <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
          Select Reason
        </h2>
        <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-400">
          Loading reasons…
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        Select Reason
      </h2>

      <UniversalDropdown
        value={reasonId ? String(reasonId) : ""}
        onChange={(v) => onSelectReason(v ? Number(v) : "")}
        options={reasons.map((r) => ({ value: String(r.reason_id), label: r.description }))}
        placeholder="Choose a reason for your visit"
      />
    </section>
  );
}
