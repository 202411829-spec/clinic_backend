import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatRangeLabel,
  getCalendarDays,
  getRangePreview,
  isDateDisabled,
  moveFocusISO,
  pickRangeDate,
} from "../../src/lib/dateRangeCalendar.js";
import { getOverlayPosition } from "../../src/lib/gcOverlayPosition.js";

const read = (relativePath) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const picker = read("src/components/ui/DateRangePicker.jsx");
const css = read("src/assets/styles/gc-rfb-ui.css");
const dashboardLogbook = read("src/components/admin/LogbookPanel.jsx");
const fullLogbook = read("src/components/admin/LogbookFullPanel.jsx");
const logbookQuery = read("src/lib/logbookQuery.js");
const reportsPanel = read("src/components/admin/ReportsFullPanel.jsx");

test("range selection starts, completes, swaps, and resets", () => {
  assert.deepEqual(pickRangeDate({ from: "", to: "" }, "2026-11-10"), {
    from: "2026-11-10",
    to: "",
  });
  assert.deepEqual(pickRangeDate({ from: "2026-11-10", to: "" }, "2026-11-20"), {
    from: "2026-11-10",
    to: "2026-11-20",
  });
  assert.deepEqual(pickRangeDate({ from: "2026-11-10", to: "" }, "2026-11-05"), {
    from: "2026-11-05",
    to: "2026-11-10",
  });
  assert.deepEqual(pickRangeDate({ from: "2026-11-10", to: "2026-11-20" }, "2026-11-25"), {
    from: "2026-11-25",
    to: "",
  });
});

test("hover preview previews both forward and swapped ranges", () => {
  const selectingEnd = { from: "2026-11-20", to: "" };
  assert.deepEqual(getRangePreview(selectingEnd, "2026-11-15"), {
    start: "2026-11-15",
    end: "2026-11-20",
    isPreview: true,
  });
  assert.deepEqual(getRangePreview(selectingEnd, "2026-11-25"), {
    start: "2026-11-20",
    end: "2026-11-25",
    isPreview: true,
  });
  assert.equal(getRangePreview(selectingEnd, "").isPreview, false);
  assert.deepEqual(getRangePreview({ from: "2026-11-20", to: "2026-11-10" }, ""), {
    start: "2026-11-10",
    end: "2026-11-20",
    isPreview: false,
  });
  assert.equal(formatRangeLabel({ from: "2026-11-10", to: "2026-11-20" }), "Nov 10, 2026 - Nov 20, 2026");
  assert.equal(formatRangeLabel({ from: "2026-11-20", to: "" }), "From Nov 20, 2026");
});

test("calendar grid, disabled dates, and keyboard focus honor the same rules", () => {
  const days = getCalendarDays(new Date(2026, 10, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);

  assert.equal(isDateDisabled(new Date(2026, 10, 1), { minDate: "2026-11-05" }), true);
  assert.equal(isDateDisabled(new Date(2026, 10, 25), { maxDate: "2026-11-20" }), true);
  assert.equal(
    isDateDisabled(new Date(2026, 10, 10), { disabled: (day, iso) => iso === "2026-11-10" }),
    true
  );
  assert.equal(isDateDisabled(new Date(2026, 10, 10)), false);

  assert.equal(moveFocusISO("2026-11-20", 7, {}), "2026-11-27");
  assert.equal(moveFocusISO("2026-11-20", -7, { minDate: "2026-11-01" }), "2026-11-13");
  assert.equal(moveFocusISO("2026-11-30", 1, { maxDate: "2026-11-30" }), "");
});

test("overlay position clamps to viewport and flips above when needed", () => {
  const belowTrigger = { left: 100, right: 220, width: 120, top: 100, bottom: 132, height: 32 };
  const below = getOverlayPosition({
    triggerRect: belowTrigger,
    panelWidth: 336,
    panelHeight: 360,
    viewport: { width: 1024, height: 768 },
  });
  assert.equal(below.hidden, false);
  assert.equal(below.placeAbove, false);
  assert.equal(below.top, 140);
  assert.equal(below.left, 100);
  assert.equal(below.width, 336);

  const above = getOverlayPosition({
    triggerRect: { left: 100, right: 220, width: 120, top: 700, bottom: 732, height: 32 },
    panelWidth: 336,
    panelHeight: 360,
    viewport: { width: 1024, height: 768 },
  });
  assert.equal(above.hidden, false);
  assert.equal(above.placeAbove, true);
  assert.ok(above.top >= 8);
  assert.ok(above.top + 360 <= 760);

  const rightAligned = getOverlayPosition({
    triggerRect: { left: 950, right: 1030, width: 80, top: 100, bottom: 132, height: 32 },
    panelWidth: 336,
    panelHeight: 360,
    viewport: { width: 1024, height: 768 },
    align: "right",
  });
  assert.equal(rightAligned.left, 680);

  const narrow = getOverlayPosition({
    triggerRect: belowTrigger,
    panelWidth: 336,
    panelHeight: 360,
    viewport: { width: 320, height: 768 },
  });
  assert.equal(narrow.width, 304);
  assert.equal(narrow.left, 8);

  assert.equal(
    getOverlayPosition({
      triggerRect: { left: -500, right: -400, width: 100, top: 100, bottom: 132, height: 32 },
      panelWidth: 336,
      panelHeight: 360,
      viewport: { width: 1024, height: 768 },
    }).hidden,
    true
  );
});

test("DateRangePicker reuses shared presence, origin, portal, and keyboard patterns", () => {
  assert.match(picker, /createPortal/);
  assert.match(picker, /useModalPresence\(open, CLOSE_DURATION\)/);
  assert.match(picker, /const \{ mounted, visible: presenceVisible \} = useModalPresence\(open, CLOSE_DURATION\)/);
  assert.match(picker, /const visible = open \|\| presenceVisible/);
  assert.match(picker, /CLOSE_DURATION = GC_MODAL_CLOSE_MS/);
  assert.match(picker, /useTriggerOrigin/);
  assert.match(picker, /GC_OVERLAY_Z\.popover/);
  assert.match(picker, /gc-cal-pop-portal/);
  assert.match(picker, /visible \? "is-open" : "is-close"/);
  assert.match(picker, /position\.placeAbove \? "is-above"/);
  assert.match(picker, /visibility: position\.hidden/);
  assert.match(picker, /aria-haspopup="dialog"/);
  assert.match(picker, /event\.key === "Escape"/);
  assert.match(picker, /document\.addEventListener\("mousedown"/);
  assert.match(picker, /document\.addEventListener\("touchstart"/);
  assert.match(picker, /onMouseEnter/);
  assert.match(picker, /moveFocusISO/);
  assert.match(picker, /getRangePreview/);
  assert.match(picker, /pickRangeDate/);
  assert.match(picker, /Select end date/);
  assert.match(picker, /export function RangeCalendarPanel/);
  assert.match(picker, /<RangeCalendarPanel\b/);
  assert.match(read("src/components/admin/LogbookRangePicker.jsx"), /import \{ CalendarTriggerButton, RangeCalendarPanel \}/);
});

test("range-calendar triggers reuse the Logbook trigger component and CSS", () => {
  assert.match(picker, /export const CalendarTriggerButton = forwardRef/);
  assert.match(picker, /gc-cal-trigger gc-no-btn-anim \$\{className\}/);
  assert.match(picker, /gc-cal-trigger-icon h-4 w-4 shrink-0/);
  assert.match(picker, /gc-cal-trigger-text/);
  assert.equal((picker.match(/<CalendarTriggerButton\b/g) || []).length, 1);

  for (const [name, source] of [
    ["Dashboard Logbook", dashboardLogbook],
    ["Full Logbook", fullLogbook],
  ]) {
    assert.match(source, /import LogbookRangePicker/, `${name} should import the Reports-style control`);
    assert.match(source, /<LogbookRangePicker/, `${name} should render the Reports-style control`);
    assert.doesNotMatch(source, /type="date"/, `${name} should not keep separate date inputs`);
  }

  assert.match(
    reportsPanel,
    /import \{ CalendarTriggerButton, RangeCalendarPanel \} from "\.\.\/ui\/DateRangePicker\.jsx"/
  );
  assert.equal((reportsPanel.match(/<CalendarTriggerButton\b/g) || []).length, 1);
  assert.match(reportsPanel, /aria-label="Select report period"/);
  assert.match(reportsPanel, /aria-haspopup=\{canOpenPicker \? "dialog" : undefined\}/);
  assert.match(reportsPanel, /aria-expanded=\{pickerOpen\}/);
  assert.match(reportsPanel, /\{periodLabel\}/);
  assert.match(reportsPanel, /useTriggerOrigin/);
  assert.match(reportsPanel, /periodOrigin\.className/);
  assert.doesNotMatch(
    reportsPanel,
    /rounded-control border border-ink-200 px-3 text-sm font-semibold text-ink-700/
  );
  assert.doesNotMatch(reportsPanel, /<span className="truncate">\{periodLabel\}<\/span>/);
});

test("one trigger click has one portal popup and opens without the exit animation", () => {
  assert.equal((picker.match(/createPortal\(/g) || []).length, 1);
  assert.equal((picker.match(/role="dialog"/g) || []).length, 1);
  assert.equal((picker.match(/<CalendarGrid\b/g) || []).length, 1);
  assert.match(picker, /const visible = open \|\| presenceVisible/);
  assert.match(picker, /visible \? "is-open" : "is-close"/);

  for (const [name, source] of [
    ["Dashboard Logbook", dashboardLogbook],
    ["Full Logbook", fullLogbook],
  ]) {
    assert.equal(
      (source.match(/<LogbookRangePicker\b/g) || []).length,
      1,
      `${name} should render exactly one shared Reports-style control`
    );
  }
});

test("GC-RFB calendar chrome, range states, and reduced motion cover the popup", () => {
  assert.match(css, /\.gc-cal-trigger \{[\s\S]*?border-radius: 9999px/);
  assert.match(css, /\.gc-cal-trigger-icon \{ color: #16a34a/);
  assert.match(css, /\.gc-cal-cell\.is-in-range::before/);
  assert.match(css, /\.gc-cal-day\.is-today/);
  assert.match(css, /gcCalPopIn 0\.32s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.match(css, /gcCalPopOut 0\.26s cubic-bezier\(0\.4, 0, 0\.2, 1\) forwards/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const reducedMotionBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reducedMotionBlock, /\.gc-cal-pop\.is-open/);
  assert.match(reducedMotionBlock, /\.gc-cal-pop\.gc-origin-panel/);
});

test("both logbook filters use the shared picker without changing date query keys", () => {
  for (const [name, source] of [
    ["Dashboard Logbook", dashboardLogbook],
    ["Full Logbook", fullLogbook],
  ]) {
    assert.match(source, /import LogbookRangePicker/, `${name} should import the shared control`);
    assert.match(source, /<LogbookRangePicker/, `${name} should render the shared control`);
    assert.doesNotMatch(source, /type="date"/, `${name} should not keep separate date inputs`);
    assert.match(source, /onChange=\{changeDateRange\}/, `${name} should feed its existing date state`);
    assert.match(source, /setDateFrom\(from\)/);
    assert.match(source, /setDateTo\(to\)/);
    assert.match(source, /setPage\(1\)/);
  }
  assert.match(logbookQuery, /params\.date_from = dateFrom/);
  assert.match(logbookQuery, /params\.date_to = dateTo/);
});

test("single-date fields and Academic Timeline controls remain separate", () => {
  const studentRecord = read("src/components/admin/StudentRecordPanel.jsx");
  assert.match(studentRecord, /import RecordDatePicker/);
  assert.doesNotMatch(studentRecord, /type="date"/, "record forms use the designed single-date picker");
  assert.match(read("src/components/student/EditStudentInfoModal.jsx"), /type="date"/);
  const schoolBased = read("src/components/admin/SchoolBasedPeriodPicker.jsx");
  assert.match(schoolBased, /semester/i);
  assert.match(schoolBased, /MonthRangeCalendarPanel/);
  assert.doesNotMatch(schoolBased, /<DateRangePicker\b/);
  assert.match(read("src/components/admin/PeriodDropdown.jsx"), /REGULAR_TIME_PERIODS\.map/);
});
