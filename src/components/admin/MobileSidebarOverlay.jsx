// src/components/admin/MobileSidebarOverlay.jsx
import { useEffect, useState } from "react";
import SidebarNav from "./SidebarNav";

export default function MobileSidebarOverlay({ open, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // next tick, so the slide-up transition actually plays
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        aria-label="Close menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute inset-x-3 bottom-3 top-3 bg-gc-green rounded-[28px] shadow-xl overflow-hidden flex flex-col transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1 w-16 rounded-full bg-white/40" />
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}