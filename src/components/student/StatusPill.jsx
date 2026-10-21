// src/components/student/StatusPill.jsx
// One status vocabulary for every student-side surface (dashboard table,
// upcoming card). Uses the low-chroma `signal` hues, same as the admin pills.
const TONES = {
  pending: "bg-signal-amber-bg text-signal-amber ring-signal-amber-ring",
  completed: "bg-brand-50 text-brand-800 ring-brand-200",
  cancelled: "bg-signal-rose-bg text-signal-rose ring-signal-rose-ring",
  no_show: "bg-signal-slate-bg text-signal-slate ring-signal-slate-ring",
};
const DOTS = {
  pending: "bg-signal-amber",
  completed: "bg-brand-600",
  cancelled: "bg-signal-rose",
  no_show: "bg-signal-slate",
};
export const STATUS_LABELS = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export default function StatusPill({ status = "pending", label }) {
  const key = TONES[status] ? status : "pending";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ring-inset ${TONES[key]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[key]}`} />
      {label ?? STATUS_LABELS[key]}
    </span>
  );
}
