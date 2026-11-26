// Pure viewport-position math for the GC-RFB calendar popover.
// Kept separate from gcMotion.js so trigger-origin/modal-presence logic stays
// single-sourced while overlay placement remains easy to unit test.

export const GC_OVERLAY_GAP = 8;
export const GC_OVERLAY_MARGIN = 8;
export const GC_OVERLAY_PREFERRED_WIDTH = 336;

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function getOverlayPosition({
  triggerRect,
  panelWidth = GC_OVERLAY_PREFERRED_WIDTH,
  panelHeight = 360,
  viewport = {},
  gap = GC_OVERLAY_GAP,
  margin = GC_OVERLAY_MARGIN,
  align = "left",
} = {}) {
  const viewportWidth = Math.max(0, finiteNumber(viewport.width, 0));
  const viewportHeight = Math.max(0, finiteNumber(viewport.height, 0));
  const safeGap = Math.max(0, finiteNumber(gap, GC_OVERLAY_GAP));
  const safeMargin = Math.max(0, finiteNumber(margin, GC_OVERLAY_MARGIN));
  const preferredWidth = Math.max(0, finiteNumber(panelWidth, GC_OVERLAY_PREFERRED_WIDTH));
  const estimatedHeight = Math.max(0, finiteNumber(panelHeight, 360));

  const fallback = {
    top: 0,
    left: 0,
    width: preferredWidth,
    maxHeight: estimatedHeight,
    placeAbove: false,
    hidden: true,
  };

  if (!triggerRect || viewportWidth <= 0 || viewportHeight <= 0) return fallback;

  const leftEdge = finiteNumber(triggerRect.left, 0);
  const rightEdge = finiteNumber(triggerRect.right, leftEdge + finiteNumber(triggerRect.width, 0));
  const topEdge = finiteNumber(triggerRect.top, 0);
  const bottomEdge = finiteNumber(triggerRect.bottom, topEdge + finiteNumber(triggerRect.height, 0));

  const offscreen =
    rightEdge + safeMargin < 0 ||
    leftEdge - safeMargin > viewportWidth ||
    bottomEdge + safeMargin < 0 ||
    topEdge - safeMargin > viewportHeight;
  if (offscreen) return fallback;

  const usableWidth = Math.max(0, viewportWidth - safeMargin * 2);
  const width = usableWidth > 0 ? Math.min(preferredWidth, usableWidth) : preferredWidth;

  let desiredLeft = leftEdge;
  if (align === "right") desiredLeft = rightEdge - width;
  if (align === "center") desiredLeft = leftEdge + finiteNumber(triggerRect.width, 0) / 2 - width / 2;
  const maxLeft = Math.max(0, viewportWidth - width - safeMargin);
  const left = Math.max(Math.min(safeMargin, maxLeft), Math.min(desiredLeft, maxLeft));

  const belowTop = bottomEdge + safeGap;
  const belowSpace = Math.max(0, viewportHeight - safeMargin - belowTop);
  const aboveSpace = Math.max(0, topEdge - safeGap - safeMargin);
  const minimumHeight = Math.min(160, estimatedHeight);
  const placeAbove = belowSpace < minimumHeight && aboveSpace > belowSpace;
  const availableHeight = placeAbove ? aboveSpace : belowSpace;
  const hidden = availableHeight < minimumHeight;

  const renderedHeight = Math.min(estimatedHeight, Math.max(0, availableHeight));
  const desiredTop = placeAbove ? topEdge - safeGap - renderedHeight : belowTop;
  const maxTop = Math.max(0, viewportHeight - safeMargin - renderedHeight);
  const top = Math.max(0, Math.min(desiredTop, maxTop));

  return {
    top,
    left,
    width,
    maxHeight: Math.max(0, availableHeight),
    placeAbove,
    hidden,
  };
}
