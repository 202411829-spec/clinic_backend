// src/data/studentRecordSample.js
// Re-exports from src/lib/format.js and src/lib/referenceData.js.
// This file is kept for backward compatibility with existing imports.

export {
  academicYears,
  resultOptions,
  glucoseOptions,
  proteinOptions,
  bloodTypeOptions,
  labExamTypeOptions,
  labResultOptions,
  labOtherFieldsConfig,
} from "../lib/referenceData.js";

export {
  createEmptyYearRecord,
  getHistorySummary,
  formatLongDateISO,
  computeAge,
} from "../lib/format.js";
