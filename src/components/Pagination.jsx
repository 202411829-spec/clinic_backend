// src/components/Pagination.jsx
// Shared pagination control with prev/next buttons, page numbers, and
// ellipsis, used by LogbookFullPanel, LogbookPanel, and Masterlist.

export default function Pagination({ page, pageCount, onChange, label, className = "" }) {
  // Show up to 10 page numbers to match the design, even if there isn't
  // enough data yet to actually fill them all — those extra numbers are
  // just visual placeholders and stay inactive until real data reaches them.
  const displayCount = Math.max(pageCount, 10);
  const pages = [];
  const window = 1;
  for (let p = 1; p <= displayCount; p++) {
    if (
      p === 1 ||
      p === displayCount ||
      (p >= page - window && p <= page + window)
    ) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className={className}>
      {label && <p className="text-xs text-gray-400">{label}</p>}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => p <= pageCount && onChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                p === page
                  ? "bg-gc-green text-white"
                  : "text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onChange(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
          aria-label="Next page"
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
