import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { asCalendarDate, calendarAnchor } from "../../src/lib/calendar.js";
import { formatRecordDate, formatRecordDateLabel, parseRecordDate } from "../../src/lib/recordDate.js";

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
const panel = read("src/components/admin/StudentRecordPanel.jsx");
const picker = read("src/components/admin/RecordDatePicker.jsx");
const calendar = read("src/components/admin/SelectDateCalendar.jsx");
const certificatePanel = read("src/components/admin/MedicalCertificatePanel.jsx");
const certificatePage = read("src/pages/admin/MedicalCertificate.jsx");
const api = read("src/lib/api.js");

test("annual exam creation never forwards the header's null school_year", () => {
  assert.match(
    panel,
    /schoolYear:\s*row\.school_year\s*\?\?\s*DEFAULT_YEAR_SCHOOL_YEAR\[yrLabel\]/,
    "placeholder header rows must fall back to the form's academic year"
  );
  assert.match(
    panel,
    /const school_year =\s*yearObj\?\.schoolYear\s*\?\?\s*DEFAULT_YEAR_SCHOOL_YEAR\[yearLabel\]/,
    "ensureAnnualExamId needs the same fallback as the header"
  );
  assert.match(panel, /date_examined:\s*records\[yearLabel\]\?\.dateExamined/);
});

test("medical-record date fields use the designed calendar, not the native input", () => {
  assert.doesNotMatch(panel, /type="date"/);
  assert.match(panel, /import RecordDatePicker from "\.\/RecordDatePicker\.jsx"/);
  assert.match(panel, /<DateInput[\s\S]*?value=\{rec\.dateExamined\}/);
  assert.match(panel, /<DateInput[\s\S]*?value=\{rec\.chestXray\.date\}/);
  assert.match(panel, /<DateInput[\s\S]*?value=\{rec\.cbc\.date\}/);
  assert.match(panel, /<DateInput[\s\S]*?value=\{rec\.urinalysis\.date\}/);
});

test("record date picker reuses GC calendar chrome and emits ISO dates", () => {
  for (const needle of [
    /CalendarTriggerButton/,
    /PortalOverlay/,
    /SelectDateCalendar/,
    /useModalPresence\(open, GC_MODAL_CLOSE_MS\)/,
    /useTriggerOrigin/,
    /gc-cal-pop-portal/,
    /navigationMode="month"/,
    /onChange\?\.\(nextDate \? formatRecordDate\(nextDate\) : ""\)/,
  ]) {
    assert.match(picker, needle, String(needle));
  }
});

test("parsing and formatting record dates is timezone-safe", () => {
  const parsed = parseRecordDate("2026-11-26");
  assert.deepEqual(
    [parsed.getFullYear(), parsed.getMonth(), parsed.getDate()],
    [2026, 10, 26]
  );
  assert.equal(formatRecordDate(parsed), "2026-11-26");
  assert.equal(formatRecordDate(new Date(2026, 10, 26)), "2026-11-26");
  assert.equal(formatRecordDateLabel("2026-11-26"), "11/26/2026");
  assert.equal(formatRecordDate(""), "");
  assert.equal(parseRecordDate("2026-02-30"), null);
});

test("physical and lab payloads preserve dates and every other-exam entry", () => {
  assert.match(panel, /date_examined:\s*rec\.dateExamined \|\| null/);
  assert.match(
    panel,
    /JSON\.stringify\(\{ type: rec\.otherLabType, details: rec\.otherLabDetails, extra: rec\.extraLabOthers \}\)/
  );
  assert.match(panel, /if \(Array\.isArray\(parsed\.extra\)\) next\.extraLabOthers = parsed\.extra/);
});

test("diagnosis save and reload carry signer metadata", () => {
  assert.match(panel, /license_no:\s*rec\.diagnosisLicenseNo \|\| null/);
  assert.match(panel, /diagnosisExaminedBy:\s*diag\.examined_by/);
  assert.match(panel, /diagnosisLicenseNo:\s*diag\.license_no/);
  assert.match(
    certificatePanel,
    /certificate\.diagnosis \?\? sync\.diagnosis \?\? ""/
  );
  assert.match(
    certificatePanel,
    /certificate\.final_remark \?\? certificate\.finalRemark \?\? sync\.finalRemark \?\? ""/
  );
});

test("empty physical dates open the shared calendar without reading a null Date", () => {
  assert.match(calendar, /const selectedDay = asCalendarDate\(selectedDate\)/);
  assert.match(calendar, /calendarAnchor\(selectedDate\)/);
  assert.doesNotMatch(calendar, /selectedDate\.getFullYear\(\)/);
  assert.doesNotMatch(calendar, /new Date\(selectedDate\)/);

  assert.equal(asCalendarDate(null), null);
  assert.equal(asCalendarDate(undefined), null);
  const anchor = calendarAnchor(null);
  assert.ok(anchor instanceof Date);
  assert.equal(Number.isNaN(anchor.getTime()), false);
});

test("physical date values survive select, change, and empty states", () => {
  assert.equal(parseRecordDate(null), null);
  assert.equal(parseRecordDate(""), null);
  assert.equal(formatRecordDate(null), "");
  assert.equal(formatRecordDateLabel(null), "");

  const firstPick = parseRecordDate(new Date(2026, 1, 2, 15, 30));
  assert.equal(formatRecordDate(firstPick), "2026-02-02");

  const changedPick = parseRecordDate("2026-02-02");
  changedPick.setMonth(2, 3);
  assert.equal(formatRecordDate(changedPick), "2026-03-03");
  assert.equal(formatRecordDateLabel(changedPick), "03/03/2026");

  assert.match(picker, /selectedDate=\{selectedDate\}/);
  assert.match(picker, /onChange\?\.\(nextDate \? formatRecordDate\(nextDate\) : ""\)/);
  assert.match(panel, /onChange=\{\(date\) => updateRecord\(\{ dateExamined: date \}\)\}/);
  assert.match(panel, /date_examined:\s*rec\.dateExamined \|\| null/);
});

test("certificate action lives with diagnosis and saves the selected year first", () => {
  assert.match(panel, /async function handleCreateMedicalCertificate\(\)/);
  assert.match(panel, /const yearLabel = activeYear/);
  assert.match(panel, /recordsApi\.savePhysicalExam\(examId, buildPhysicalPayload\(cur\)\)/);
  assert.match(panel, /recordsApi\.saveLabResults\(examId, buildLabPayload\(cur\)\)/);
  assert.match(panel, /recordsApi\.saveDiagnosis\(examId, buildDiagnosisPayload\(cur\)\)/);
  assert.match(panel, /state: \{ year: yearLabel, annualExamId: examId \}/);
  assert.doesNotMatch(panel, /medical-certificate\?year=\$\{activeYear\}`, \{ state: \{ year: activeYear \}/);
  assert.match(certificatePage, /const selectedExamId = location\.state\?\.annualExamId \?\? null/);
  assert.match(certificatePage, /if \(selectedExamId\) \{\s*examId = selectedExamId/);
});

test("certificate saves reconcile stale annual exam IDs without creating duplicates", () => {
  assert.match(panel, /async function resolveExistingAnnualExamId\(yearLabel\)/);
  assert.match(panel, /const reconciled = await resolveExistingAnnualExamId\(yearLabel\)/);
  assert.match(panel, /function isDuplicateAnnualExamError\(error\)/);
  assert.match(panel, /const recovered = await resolveExistingAnnualExamId\(yearLabel\)/);
  assert.doesNotMatch(panel, /savePhysicalExam\([^\n]*\)\.catch\(\(\) => \{\}\)/);
  assert.match(panel, /const lab = phys \? await recordsApi\.labResults\(examId\)/);
});

test("all four academic years bind the certificate to the selected annual exam", () => {
  assert.match(
    panel,
    /const DEFAULT_YEAR_LABELS = \["Year I", "Year II", "Year III", "Year IV"\]/
  );
  assert.match(panel, /const yearLabel = activeYear/);
  assert.match(panel, /const examId = await ensureAnnualExamId\(yearLabel\)/);
  assert.match(panel, /state: \{ year: yearLabel, annualExamId: examId \}/);
  assert.match(certificatePage, /const selectedExamId = location\.state\?\.annualExamId \?\? null/);
  assert.match(certificatePage, /if \(selectedExamId\) \{\s*examId = selectedExamId/);
  assert.match(certificatePanel, /getCertificateDefaults\(student\.id, yearLabel\)/);
  assert.match(certificatePanel, /certificate\.diagnosis \?\? sync\.diagnosis/);
});

test("annual exam status dropdown uses persisted enum values for one year at a time", () => {
  assert.match(panel, /no_record: "No Record"/);
  assert.match(panel, /pending: "Pending"/);
  assert.match(panel, /cleared: "Cleared"/);
  assert.match(panel, /handleStatusChange\(row\.key, value\)/);
  assert.match(panel, /recordsApi\.updateAnnualExamStatus\(examId, \{/);
  assert.match(panel, /exam_status: nextStatusValue/);
  assert.match(api, /updateAnnualExamStatus:.*api\.patch/);
});
