// src/components/student/BookingStepIndicator.jsx
// Mobile-only 4-step progress indicator for the Book flow. Completed steps
// are tappable so the student can jump back and change an earlier choice.

const STEPS = [
  { n: 1, label: "Date" },
  { n: 2, label: "Time" },
  { n: 3, label: "Reason" },
  { n: 4, label: "Confirmation" },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * step: 1 | 2 | 3 | 4 — the current active step
 * onStepClick: (n: number) => void — only called for completed (n < step) steps
 */
export default function BookingStepIndicator({ step, onStepClick }) {
  return (
    <div className="flex items-start justify-between max-w-sm mx-auto mb-5">
      {STEPS.map(({ n, label }) => {
        const completed = n < step;
        const active = n === step;
        const clickable = completed && typeof onStepClick === "function";

        return (
          <div key={n} className="flex flex-col items-center gap-1.5 flex-1">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(n)}
              aria-label={`Step ${n}: ${label}`}
              aria-current={active ? "step" : undefined}
              className={[
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
                completed
                  ? "bg-gc-green text-white cursor-pointer"
                  : active
                  ? "bg-gc-accent text-white"
                  : "bg-gray-200 text-gray-400",
                !clickable ? "cursor-default" : "",
              ].join(" ")}
            >
              {completed ? <CheckIcon /> : n}
            </button>
            <span
              className={[
                "text-[10px] font-semibold text-center leading-tight",
                active || completed ? "text-gray-700" : "text-gray-400",
              ].join(" ")}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
