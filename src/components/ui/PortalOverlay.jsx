import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GC_OVERLAY_Z } from "../../lib/gcMotion.js";
import { getOverlayPosition } from "../../lib/gcOverlayPosition.js";

// Portaled menus/popovers share one positioning contract: measure the trigger,
// clamp to the viewport, flip above when needed, and stay above modal layers.
export function useOverlayPosition({
  triggerRef,
  panelRef,
  enabled,
  align = "left",
  preferredWidth = 192,
  estimatedHeight = 240,
}) {
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: preferredWidth,
    maxHeight: estimatedHeight,
    placeAbove: false,
    hidden: true,
  });

  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined" || !triggerRef.current) return undefined;

    function update() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const panelRect = panelRef.current?.getBoundingClientRect();
      setPosition(
        getOverlayPosition({
          triggerRect,
          panelWidth: Math.max(preferredWidth, panelRect?.width || 0),
          panelHeight: panelRect?.height || estimatedHeight,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          align,
        })
      );
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [enabled, triggerRef, panelRef, preferredWidth, estimatedHeight, align]);

  return position;
}

export default function PortalOverlay({
  triggerRef,
  panelRef,
  enabled = true,
  align = "left",
  preferredWidth = 192,
  estimatedHeight = 240,
  flipClassName = "is-above",
  id,
  role = "menu",
  ariaLabel,
  className = "",
  style,
  children,
  onOutside,
  onEscape,
  onMouseLeave,
}) {
  const fallbackPanelRef = useRef(null);
  const activePanelRef = panelRef ?? fallbackPanelRef;
  const position = useOverlayPosition({
    triggerRef,
    panelRef: activePanelRef,
    enabled,
    align,
    preferredWidth,
    estimatedHeight,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    function handlePointer(e) {
      if (triggerRef.current?.contains(e.target) || activePanelRef.current?.contains(e.target)) return;
      onOutside?.();
    }
    function handleKey(e) {
      if (e.key !== "Escape") return;
      onEscape?.();
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [enabled, triggerRef, activePanelRef, onOutside, onEscape]);

  if (!enabled || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={activePanelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      data-portal-overlay="true"
      onMouseLeave={onMouseLeave}
      className={`gc-overlay-portal ${position.placeAbove ? flipClassName : ""} ${className}`}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        zIndex: GC_OVERLAY_Z.dropdown,
        visibility: position.hidden ? "hidden" : "visible",
        pointerEvents: position.hidden ? "none" : "auto",
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
