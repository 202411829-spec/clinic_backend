// src/components/admin/MobileMenuHandle.jsx
export default function MobileMenuHandle({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open menu"
      className="btn-press lg:hidden fixed inset-x-0 bottom-0 z-40 h-8 bg-gc-green rounded-t-[24px] flex items-center justify-center print:hidden transition-colors duration-200 active:bg-gc-green-600"
    >
      <span className="h-1 w-16 rounded-full bg-white/70" />
    </button>
  );
}