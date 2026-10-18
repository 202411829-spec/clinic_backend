// src/components/student/StudentMobileMenuHandle.jsx
export default function StudentMobileMenuHandle({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open menu"
      className="btn-press md:hidden fixed inset-x-0 bottom-0 z-40 h-8 bg-shell rounded-t-[24px] shadow-[0_-8px_24px_rgba(0,0,0,.25)] flex items-center justify-center print:hidden transition-colors duration-200 active:bg-brand-900"
    >
      <span className="h-1 w-16 rounded-full bg-white/70" />
    </button>
  );
}
