// src/lib/referenceData.js
// Reference option constants for student record forms — used by the admin
// record panels and the student info edit form.

export const resultOptions = ["Normal", "With Findings"];
export const glucoseOptions = ["Negative", "Trace", "1+", "2+", "3+", "4+"];
export const proteinOptions = ["Negative", "Trace", "1+", "2+", "3+", "4+"];
export const bloodTypeOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const labExamTypeOptions = [
  "Fecalysis",
  "Drug Testing",
  "HBSAG",
  "Anti HAV Igm",
  "Anti HBS",
];

// Negative / Positive dropdown shared by the qualitative "Others" lab tests
// (drug screening panels, hepatitis screening, etc).
export const labResultOptions = ["Negative", "Positive"];

export const fecalysisColorOptions = ["Yellow", "Brown", "Green", "Black", "Red", "Clay/White"];
export const fecalysisConsistencyOptions = ["Formed", "Semi-formed", "Soft", "Loose", "Watery"];

// Drives the extra fields that appear under each "Others" Examination Type
// row on the Laboratory Results section — add a new Examination Type here
// and its fields will automatically show up wherever that dropdown is used.
export const labOtherFieldsConfig = {
  Fecalysis: [
    { key: "color", label: "Color", type: "select", options: fecalysisColorOptions },
    { key: "consistency", label: "Consistency", type: "select", options: fecalysisConsistencyOptions },
    { key: "pusCells", label: "Pus Cells", type: "text" },
    { key: "rbc", label: "Rbc", type: "text" },
    { key: "parasitesOva", label: "Parasites Ova", type: "text" },
  ],
  "Drug Testing": [
    { key: "methamphetamine", label: "Methamphetamine", type: "select", options: labResultOptions },
    { key: "tetrahydrocannabinol", label: "Tetrahydrocannabinol", type: "select", options: labResultOptions },
  ],
  HBSAG: [{ key: "result", label: "Result", type: "select", options: labResultOptions }],
  "Anti HAV Igm": [{ key: "result", label: "Result", type: "select", options: labResultOptions }],
  "Anti HBS": [
    { key: "result", label: "Result", type: "select", options: labResultOptions },
    { key: "value", label: "Value", type: "text" },
  ],
};

export const academicYears = [
  { key: "y1", label: "Year I (2025 - 2026)" },
  { key: "y2", label: "Year II (2026 - 2027)" },
  { key: "y3", label: "Year III (2027 - 2028)" },
  { key: "y4", label: "Year IV (2028 - 2029)" },
];
