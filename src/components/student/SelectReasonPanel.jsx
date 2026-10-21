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
      <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
        <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
          Select Reason
        </h2>
        <div className="w-full animate-pulse rounded-control border border-ink-200 px-3 py-2.5 text-sm text-ink-400">
          Loading reasons…
        </div>
      </section>
    );
  }

  return (
    <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
      <h2 className="mb-4 text-center font-serif text-base font-semibold text-ink-900">
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
