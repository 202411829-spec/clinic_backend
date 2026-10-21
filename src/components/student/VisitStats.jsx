// src/components/student/VisitStats.jsx
import CountUp from "../ui/CountUp.jsx";
import NavIcon from "../ui/NavIcon.jsx";

const TILES = [
  { key: "total", label: "Total visits", icon: "calendar", tone: "bg-brand-50 text-brand-800" },
  { key: "completed", label: "Completed", icon: "check", tone: "bg-brand-50 text-brand-800" },
  { key: "pending", label: "Pending", icon: "clock", tone: "bg-signal-amber-bg text-signal-amber" },
  { key: "missed", label: "Cancelled / no show", icon: "x", tone: "bg-signal-slate-bg text-signal-slate" },
];

export default function VisitStats({ counts }) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {TILES.map((t) => (
        <div key={t.key} className="card-hover flex min-w-0 items-center gap-3 rounded-panel bg-white p-4 shadow-e2 md:p-5">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-card ${t.tone}`}>
            <NavIcon name={t.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-none text-ink-900">
              <CountUp value={counts[t.key] ?? 0} />
            </p>
            <p className="mt-1.5 text-xs leading-tight text-ink-500">{t.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
