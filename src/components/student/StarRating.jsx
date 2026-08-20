// src/components/student/StarRating.jsx
// Small interactive 1–5 star rating control used on the Feedback form.
// Pass `readOnly` to render a static rating display instead (used by the
// admin Feedback inbox to show each submitted rating).
import { useState } from "react";
import NavIcon from "../admin/NavIcon";

export default function StarRating({
  value = 0,
  onChange,
  readOnly = false,
  size = "w-8 h-8",
}) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => !readOnly && setHovered(0)}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        const Star = (
          <NavIcon
            name="star"
            className={[
              size,
              "transition-colors",
              filled ? "text-gc-accent" : "text-gray-200",
            ].join(" ")}
          />
        );

        if (readOnly) {
          return <span key={star}>{Star}</span>;
        }

        return (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onClick={() => onChange?.(star)}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            aria-pressed={value === star}
            className="rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent/50"
          >
            {Star}
          </button>
        );
      })}
    </div>
  );
}
