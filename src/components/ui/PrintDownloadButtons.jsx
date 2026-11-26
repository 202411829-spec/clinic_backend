// src/components/ui/PrintDownloadButtons.jsx
// Single design/animation source for every Print and Download PDF action.
// Dashboard Logbook is the reference: compact green PDF button plus an
// equally sized, white Uiverse printer button. Callers own only behavior.
import { useId } from "react";
import NavIcon from "./NavIcon.jsx";

const ACTION_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold leading-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60";

const PRINT_ACTION = `${ACTION_BASE} gc-uiverse-print-btn border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 active:bg-ink-100`;
const PDF_ACTION = `${ACTION_BASE} gc-pdf-sweep bg-gc-green text-white`;

function PrinterGlyph() {
  const rawId = useId();
  const maskId = `gc-printer-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <span className="gc-uiverse-printer-wrapper" aria-hidden="true">
      <span className="gc-uiverse-printer-container">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 92 75">
          <path
            strokeWidth="5"
            stroke="currentColor"
            d="M12 37.5H80C85.2467 37.5 89.5 41.7533 89.5 47V69C89.5 70.933 87.933 72.5 86 72.5H6C4.067 72.5 2.5 70.933 2.5 69V47C2.5 41.7533 6.75329 37.5 12 37.5Z"
          />
          <mask fill="white" id={maskId}>
            <path d="M12 12C12 5.37258 17.3726 0 24 0H57C70.2548 0 81 10.7452 81 24V29H12V12Z" />
          </mask>
          <path
            mask={`url(#${maskId})`}
            fill="currentColor"
            d="M7 12C7 2.61116 14.6112 -5 24 -5H57C73.0163 -5 86 7.98374 86 24H76C76 13.5066 67.4934 5 57 5H24C20.134 5 17 8.13401 17 12H7ZM81 29H12H81ZM7 29V12C7 2.61116 14.6112 -5 24 -5V5C20.134 5 17 8.13401 17 12V29H7ZM57 -5C73.0163 -5 86 7.98374 86 24V29H76V24C76 13.5066 67.4934 5 57 5V-5Z"
          />
          <circle fill="currentColor" r="3" cy="49" cx="78" />
        </svg>
      </span>
      <span className="gc-uiverse-printer-page-wrapper">
        <span className="gc-uiverse-printer-page" />
      </span>
    </span>
  );
}

export function PrintButton({ onClick, label = "Print", disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PRINT_ACTION} ${className}`.trim()}
    >
      <PrinterGlyph />
      <span>{label}</span>
    </button>
  );
}

export function DownloadPdfButton({
  onClick,
  disabled = false,
  loading = false,
  label = "Download PDF",
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PDF_ACTION} ${className}`.trim()}
    >
      <span className="gc-pdf-sweep__icon">
        <NavIcon name="download" className="h-4 w-4" />
      </span>
      <span className="gc-pdf-sweep__label">{loading ? "Preparing…" : label}</span>
    </button>
  );
}
