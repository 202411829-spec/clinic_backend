// src/components/student/SelectReasonPanel.jsx
import { useEffect, useState } from "react";

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

      <select
        value={reasonId || ""}
        onChange={(e) => onSelectReason(e.target.value ? Number(e.target.value) : "")}
        className={[
          "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent",
          reasonId ? "text-gray-700 font-semibold" : "text-gray-400",
        ].join(" ")}
      >
        <option value="" disabled>
          Choose a reason for your visit
        </option>
        {reasons.map((r) => (
          <option key={r.reason_id} value={r.reason_id} className="text-gray-700">
            {r.description}
          </option>
        ))}
      </select>
    </section>
  );
}
