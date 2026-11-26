// src/components/Pagination.jsx
// Shared pagination control with prev/next buttons and page numbers, used by
// Logbook and Appointments. The default keeps ellipsis; callers that want a
// compact fixed-width window can pass maxPageButtons.

import { buildPaginationPages, clampPage } from "../../lib/pagination.js";
import { buildWindowedPaginationPages } from "../../lib/pagination.js";

export default function Pagination({
  page,
  pageCount,
  onChange,
  label,
  className = "",
  maxPageButtons,
}) {
  const currentPage = clampPage(page, pageCount);
  const pages = buildPaginationPages(currentPage, pageCount);
  const displayedPages = maxPageButtons
    ? buildWindowedPaginationPages(currentPage, pageCount, maxPageButtons)
    : pages;

  return (
    <div className={className}>
      {label && <p className="text-xs text-gray-400">{label}</p>}
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {displayedPages.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                aria-current={p === currentPage ? "page" : undefined}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                  p === currentPage
                    ? "bg-gc-green text-white"
                    : "text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => onChange(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage === pageCount}
            aria-label="Next page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
