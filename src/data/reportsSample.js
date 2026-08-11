// src/data/reportsSample.js
// Placeholder data for the Reports page (/admin/reports).
// Swap `getReportData(date, department)` for a real Supabase aggregation
// query when ready — the panel only cares about this shape.

// Note: the original mockup repeated the "REASON" label for both the
// reason-breakdown and the department-breakdown cards, and repeated "SEX"
// for both the sex-breakdown and the age-breakdown cards. The mobile
// mockup correctly labels the second one "AGE", so that's used here as
// the source of truth, and the department card is labeled "Department"
// (matching what its rows — CCS, CAHS, CHTM… — actually are) so the page
// reads clearly instead of showing two identically-labeled cards.

export function getReportData() {
  return {
    status: {
      title: "Complaint",
      rows: [
        { label: "Total Students", value: "26" },
        { label: "Completed", value: "15 (57.7% of total)" },
        { label: "No-show", value: "8 (30.8% of total)" },
        { label: "Pending", value: "3 (11.5% of total)" },
      ],
    },
    reason: {
      title: "Reason",
      rows: [
        { label: "Medical Certificate", value: "18 (70% of total)" },
        { label: "Consultation", value: "8 (30% of total)" },
      ],
    },
    department: {
      title: "Department",
      rows: [
        { label: "CCS", value: "9 (23% of total)" },
        { label: "CAHS", value: "2 (15% of total)" },
        { label: "CHTM", value: "13 (40% of total)" },
        { label: "CBA", value: "5 (23% of total)" },
        { label: "CEAS", value: "3 (1% of total)" },
      ],
    },
    complaint: {
      title: "Complaint",
      rows: [
        { label: "Headache", value: "10 (50% of total)" },
        { label: "Stomachache", value: "10 (50% of total)" },
      ],
    },
    sex: {
      title: "Sex",
      rows: [
        { label: "Male", value: "9 (23% of total)" },
        { label: "Female", value: "2 (15% of total)" },
      ],
    },
    age: {
      title: "Age",
      rows: [
        { label: "23", value: "9 (23% of total)" },
        { label: "20", value: "2 (15% of total)" },
        { label: "19", value: "13 (40% of total)" },
        { label: "18", value: "5 (23% of total)" },
      ],
    },
  };
}
