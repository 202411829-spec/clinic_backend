// src/components/student/SelectReasonPanel.jsx
import { appointmentReasons } from "../../data/appointmentReasons";

/**
 * reason: string
 * onSelectReason: (reason: string) => void
 */
export default function SelectReasonPanel({ reason, onSelectReason }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-4">
        Select Reason
      </h2>

      <select
        value={reason}
        onChange={(e) => onSelectReason(e.target.value)}
        className={[
          "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent",
          reason ? "text-gray-700 font-semibold" : "text-gray-400",
        ].join(" ")}
      >
        <option value="" disabled>
          Choose a reason for your visit
        </option>
        {appointmentReasons.map((r) => (
          <option key={r} value={r} className="text-gray-700">
            {r}
          </option>
        ))}
      </select>
    </section>
  );
}
