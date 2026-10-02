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
export async function pdfLetterhead(doc, startY = 18) {
  let y = startY;
  const seals = await loadSeals();

  if (seals) {
    const [gcSeal, osws, health] = seals;
    const size = 14; // mm, roughly matches the on-screen w-14 h-14 seals
    const sealY = y - 10;
    doc.addImage(gcSeal, "PNG", 14, sealY, size, size);
    doc.addImage(osws, "PNG", 30, sealY, size, size);
    doc.addImage(health, "PNG", 196 - size, sealY, size, size);
  }

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.setTextColor("#044B0E"); // gc-green
  doc.text("GORDON COLLEGE", 105, y, { align: "center" });
  y += 4.5;

  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor("#4b5563");
  doc.text("Olongapo City Sports Complex, Donor Street, East Tapinac, Olongapo City", 105, y, { align: "center" });
  y += 3.5;
  doc.text("Tel. No.: (047) 222-4080", 105, y, { align: "center" });
  y += 4.5;

  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.setTextColor("#044B0E");
  doc.text("Office of Student Welfare and Service — Health Services Unit", 105, y, { align: "center" });
  y += 4;

  doc.setDrawColor(180);
  doc.line(14, y, 196, y);
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
 * @param {{ pixelRatio?: number }} [opts]
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export async function nodeToPng(node, { pixelRatio = 3 } = {}) {
  const { toPng } = await import("html-to-image");
  const options = {
    pixelRatio,
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

  const rect = node.getBoundingClientRect();
  return { dataUrl, width: rect.width, height: rect.height };
}
