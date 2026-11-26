// src/lib/pdf.js
// Shared jsPDF helpers for PDF generation across admin panels.

import gordonCollegeSeal from "../assets/certificate/gordon-college-seal.png";
import oswsSeal from "../assets/certificate/osws-seal.png";
import healthServicesSeal from "../assets/certificate/health-services-seal.png";

// Cache decoded <img> elements across calls — the three seals never change,
// so repeated Logbook/Reports downloads in the same session shouldn't
// re-fetch and re-decode them every time.
let sealsPromise = null;
function loadSeals() {
  if (!sealsPromise) {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    sealsPromise = Promise.all([
      load(gordonCollegeSeal),
      load(oswsSeal),
      load(healthServicesSeal),
    ]).catch(() => null); // swallow — pdfLetterhead falls back to text-only below
  }
  return sealsPromise;
}

/**
 * Draw the standard "GORDON COLLEGE" / "Office of Student Welfare..." letterhead
 * block — including the three institutional seals used on-screen (Letterhead.jsx)
 * and on the printed page — onto a jsPDF document, and return the updated y
 * cursor position. Async because the seal images need to be decoded first.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} startY - the y position to start drawing from
 * @returns {Promise<number>} the y position after the letterhead block
 */
export async function pdfLetterhead(doc, startY = 18, options = {}) {
  let y = startY;
  const seals = await loadSeals();

  // Portrait callers keep the historical values: 210mm page, 14mm margins,
  // center x=105 and right edge x=196. Landscape callers pass their own margin.
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = Number(options.margin ?? 14);
  const center = pageWidth / 2;
  const rightEdge = pageWidth - margin;
  const sealSize = Number(options.sealSize ?? 14);

  if (seals) {
    const [gcSeal, osws, health] = seals;
    const sealY = y - 10;
    doc.addImage(gcSeal, "PNG", margin, sealY, sealSize, sealSize);
    doc.addImage(osws, "PNG", margin + 16, sealY, sealSize, sealSize);
    doc.addImage(health, "PNG", rightEdge - sealSize, sealY, sealSize, sealSize);
  }

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.setTextColor("#044B0E"); // gc-green
  doc.text("GORDON COLLEGE", center, y, { align: "center" });
  y += 4.5;

  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor("#4b5563");
  doc.text("Olongapo City Sports Complex, Donor Street, East Tapinac, Olongapo City", center, y, { align: "center" });
  y += 3.5;
  doc.text("Tel. No.: (047) 222-4080", center, y, { align: "center" });
  y += 4.5;

  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.setTextColor("#044B0E");
  doc.text("Office of Student Welfare and Service — Health Services Unit", center, y, { align: "center" });
  y += 4;

  doc.setDrawColor(180);
  doc.line(margin, y, rightEdge, y);
  y += 6;

  doc.setTextColor("#000000");
  return y;
}

/**
 * Rasterize a DOM node to a PNG data URL using the browser's own layout
 * engine (html-to-image / SVG foreignObject), so text, checkboxes and borders
 * land exactly where they do in the real print preview. html2canvas re-implements
 * layout and drew text a few px lower than boxes, which is what misaligned the
 * checkboxes in the downloaded PDF.
 * @param {HTMLElement} node
 * @param {{ pixelRatio?: number, extraBottom?: number }} [opts] extraBottom: blank px added under the node so any
 *   sub-pixel growth of the re-laid-out clone (embedded web font, rounding) can't clip the last row's bottom border.
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export async function nodeToPng(node, { pixelRatio = 3, extraBottom = 0 } = {}) {
  const { toPng } = await import("html-to-image");
  const rect = node.getBoundingClientRect();
  const options = {
    pixelRatio,
    ...(extraBottom ? { height: Math.ceil(rect.height) + extraBottom } : {}),
    backgroundColor: "#ffffff",
    cacheBust: true,
    // The export nodes sit off-screen (fixed, left: -9999px); the clone that
    // gets rasterized must be in normal flow or it renders blank.
    style: { position: "static", left: "0", top: "0" },
  };

  // Safari sometimes paints the first foreignObject render before images are
  // ready — a throwaway low-res pass warms them up.
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
    await toPng(node, { ...options, pixelRatio: 1 }).catch(() => {});
  }

  let dataUrl;
  try {
    dataUrl = await toPng(node, options);
  } catch (err) {
    // Web-font embedding can fail (offline / blocked CSS) — retry with the
    // system fallback font rather than failing the whole download.
    console.warn("Font embedding failed, retrying without web fonts:", err);
    dataUrl = await toPng(node, { ...options, skipFonts: true });
  }

  return { dataUrl, width: rect.width, height: extraBottom ? Math.ceil(rect.height) + extraBottom : rect.height };
}
