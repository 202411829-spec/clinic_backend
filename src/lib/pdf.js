// src/lib/pdf.js
// Shared jsPDF helpers for PDF generation across admin panels.

/**
 * Draw the standard "GORDON COLLEGE" / "Office of Student Welfare..." letterhead
 * block on a jsPDF document and return the updated y cursor position.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} startY - the y position to start drawing from
 * @returns {number} the y position after the letterhead block
 */
export function pdfLetterhead(doc, startY = 18) {
  let y = startY;
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("GORDON COLLEGE", 105, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text("Office of Student Welfare and Service — Health Services Unit", 105, y, { align: "center" });
  y += 10;
  return y;
}
