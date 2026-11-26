// src/components/admin/MobileSidebarOverlay.jsx
import SidebarNav from "./SidebarNav";
import { GC_MODAL_CLOSE_MS, getModalMotionStyle, useModalPresence } from "../../lib/gcMotion.js";

export default function MobileSidebarOverlay({ open, onClose }) {
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const motionStyle = getModalMotionStyle(visible);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Close menu"
        onClick={onClose}
        style={motionStyle}
        className={`absolute inset-0 bg-shell/60 backdrop-blur-sm transition-opacity motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        style={motionStyle}
        className={`absolute inset-x-3 bottom-3 top-3 app-shell app-shell--flat rounded-[28px] shadow-float overflow-hidden flex flex-col transition-transform motion-reduce:transition-none ${
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