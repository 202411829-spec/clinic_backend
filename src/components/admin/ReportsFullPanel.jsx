// src/components/admin/ReportsFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "../ui/NavIcon.jsx";
import PeriodDropdown from "./PeriodDropdown.jsx";
import Letterhead from "./Letterhead.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import FilterMultiSelect from "../ui/FilterMultiSelect.jsx";
import CountUp from "../ui/CountUp.jsx";
import { PageHeader } from "../ui/primitives.jsx";
import { DownloadPdfButton, PrintButton } from "../ui/PrintDownloadButtons.jsx";
import SchoolBasedPeriodPicker from "./SchoolBasedPeriodPicker.jsx";
import RegularTimePeriodPicker from "./RegularTimePeriodPicker.jsx";
import { CalendarTriggerButton, RangeCalendarPanel } from "../ui/DateRangePicker.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { masterlistApi, reportsApi } from "../../lib/api.js";
import {
  buildAcademicDates,
  formatAcademicPeriodFileLabel,
  formatAcademicPeriodLabel,
  parseAcademicMonthISO,
  SEMESTER_OPTIONS,
  TIME_CATEGORIES,
  TIME_CATEGORY_OPTIONS,
  toAcademicMonthISO,
} from "../../lib/academicPeriod.js";
import { REGULAR_TIME_PERIODS, normalizeRegularTimePeriod } from "../../lib/reportPeriods.js";
import {
  fetchReportDates,
  mergeReportResponses,
  normalizeReportDepartments,
} from "../../lib/reportAggregation.js";
import { formatFilterSelectionLabel } from "../../lib/filterMultiSelect.js";
import {
  buildRegularTimeDates,
  formatDailyAverage,
  formatRegularFileLabel,
  formatRegularPeriodLabel,
  getDailyAverage,
  parseNonNegativeYear,
  shiftRegularSelection,
  toggleRegularDay,
} from "../../lib/reportPeriodSelection.js";
import { GC_MODAL_CLOSE_MS, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion.js";
import { toYMD } from "../../lib/calendar.js";
import {
  EMPTY_RANGE,
  formatDateLabel,
  parseISODate,
  pickRangeDate,
  startOfDay,
} from "../../lib/dateRangeCalendar.js";
import { dayRangeDates, dayRangeLabel, shiftDayRange } from "../../lib/regularTimeRange.js";
import { pdfLetterhead } from "../../lib/pdf.js";

// ─── Design tokens (shared with the rest of the admin shell) ─────────
const KICKER = "text-[11px] font-bold uppercase tracking-wider text-brand-900";
const BAR_FILL = "bg-gradient-to-r from-brand-600 to-brand-900";
const TODAY_YEAR = new Date().getFullYear();
const TODAY_MONTH = new Date().getMonth();
const DEFAULT_SCHOOL_START_YEAR = Math.max(0, TODAY_YEAR - 1);

// ─── Data shape the panel renders ─────────────────────────────────────
const EMPTY_DATA = {
  totalAppointments: 0,
  totalStudents: 0,
  dayCount: 0,
  status: { title: "Total", rows: [] },
  reason: { title: "Reason", rows: [] },
  department: { title: "Department", rows: [] },
  complaint: { title: "Complaint", rows: [] },
  sex: { title: "Sex", rows: [] },
  age: { title: "Age", rows: [] },
};

function pct(breakdown) {
  return `${breakdown.count} (${breakdown.percent}% of total)`;
}

function mapResponse(json, dayCount = 1) {
  const data = JSON.parse(JSON.stringify(EMPTY_DATA));
  data.totalAppointments = Number(json.total_appointments) || 0;
  data.totalStudents = Number(json.total_students) || 0;
  data.dayCount = Math.max(0, Number(dayCount) || 0);
  data.status.rows = [
    { label: "Total Students", value: String(json.total_students ?? 0) },
    ...(json.status_breakdown || [])
      .filter((b) => String(b.label).trim().toLowerCase() !== "no status yet")
      .map((b) => ({ label: b.label, value: pct(b) })),
  ];
  const isPlaceholder = (label) => {
    const v = String(label).trim().toLowerCase();
    return (
      v === "no status yet" ||
      v === "no reason given" ||
      v === "unknown dept" ||
      v === "no complaint logged" ||
      v === "not set" ||
      v === "unknown" ||
      v === "-" ||
      v === "n/a" ||
      v === ""
    );
  };
  data.reason.rows = (json.reason_breakdown || [])
    .filter((b) => !isPlaceholder(b.label))
    .map((b) => ({
      label: b.label,
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  data.department.rows = (json.department_breakdown || [])
    .filter((b) => !isPlaceholder(b.label))
    .map((b) => ({
      label: b.label,
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  data.complaint.rows = (json.complaint_breakdown || [])
    .filter((b) => !isPlaceholder(b.label))
    .map((b) => ({
      label: b.label,
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  data.sex.rows = (json.sex_breakdown || [])
    .filter((b) => !isPlaceholder(b.label))
    .map((b) => ({
      label: b.label,
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  data.age.rows = (json.age_breakdown || [])
    .filter((b) => !isPlaceholder(b.label))
    .map((b) => ({
      label: String(b.label),
      value: pct(b),
      count: b.count,
      percent: b.percent,
    }));
  return data;
}

// ─── KPI summary card ─────────────────────────────────────────────────
function KpiCard({ label, value, text, badge, icon }) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-panel bg-white p-5 shadow-e2 md:p-6">
      {icon && (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-800">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className={KICKER}>{label}</p>
        {text !== undefined ? (
          <p
            title={text}
            className="cell-wrap mt-1.5 line-clamp-2 text-xl font-semibold leading-tight text-ink-900"
          >
            {text}
          </p>
        ) : (
          <p className="mt-1.5 text-3xl font-semibold leading-none text-ink-900">
            <CountUp value={value} />
          </p>
        )}
        {badge && (
          <span className="mt-2 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Breakdown card with animated progress bars ───────────────────────
function BreakdownCard({ title, rows }) {
  const total = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  return (
    <div className="rounded-panel bg-white p-5 shadow-e2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={KICKER}>{title}</h2>
        {rows.length > 0 && (
          <span className="shrink-0 text-[11px] text-ink-500">
            <b className="tnum text-sm font-semibold text-ink-900">{total.toLocaleString()}</b> total
          </span>
        )}
      </div>
      <div className="mt-4 space-y-4">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-400">No data available</p>
        )}
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-3 text-xs">
            <span className="cell-wrap w-28 shrink-0 text-ink-600 sm:w-36" title={r.label}>
              {r.label}
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full origin-left animate-grow-x rounded-full ${BAR_FILL}`}
                style={{ width: `${Math.min(100, r.percent || 0)}%`, animationDelay: `${i * 90}ms` }}
              />
            </div>
            <span className="tnum w-20 shrink-0 text-right font-semibold text-ink-700">
              {r.count ?? r.value}
              {r.percent != null && <span className="ml-1 font-normal text-ink-400">{r.percent}%</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vertical bar chart (age groups) ──────────────────────────────────
function BarChartCard({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.count) || 0));
  const peak = rows.reduce((best, r, i) => ((Number(r.count) || 0) > (Number(rows[best]?.count) || 0) ? i : best), 0);
  return (
    <div className="rounded-panel bg-white p-5 shadow-e2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={KICKER}>{title}</h2>
        {rows.length > 0 && (
          <span className="text-[11px] text-ink-500">Peak: <b className="font-semibold text-ink-900">{rows[peak]?.label}</b></span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">No data available</p>
      ) : (
        <div className="mt-5 flex h-48 items-end gap-2 sm:gap-3">
          {rows.map((r, i) => {
            const n = Number(r.count) || 0;
            return (
              <div key={r.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${r.label}: ${n}`}>
                <span className="tnum mb-1 text-[10px] font-semibold text-ink-700">{n}</span>
                <div
                  className={`w-full origin-bottom animate-grow-y rounded-t-lg transition group-hover:brightness-110 ${
                    i === peak ? "bg-gradient-to-t from-gold-500 to-gold-300" : "bg-gradient-to-t from-brand-900 to-brand-600"
                  }`}
                  style={{ height: `${Math.max(4, (n / max) * 100)}%`, animationDelay: `${i * 60}ms` }}
                />
                <span className="mt-2 w-full truncate text-center text-[10px] font-semibold text-ink-500">{r.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ranked table (complaints) ────────────────────────────────────────
function RankTable({ title, rows, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-panel bg-white shadow-e2 ${className}`}>
      <h2 className={`px-5 pt-5 ${KICKER}`}>{title}</h2>
      <div className="tbl-scroll mt-3 max-h-[26rem] overflow-y-auto">
        <table className="tbl min-w-[520px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-[1] w-12 bg-ink-50">#</th>
              <th className="sticky top-0 z-[1] bg-ink-50">Complaint</th>
              <th className="sticky top-0 z-[1] bg-ink-50 text-center">Cases</th>
              <th className="sticky top-0 z-[1] bg-ink-50">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-ink-400">No data available</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.label} className="odd:bg-brand-50/40">
                <td className="tnum text-ink-400">{i + 1}</td>
                <td className="cell-wrap min-w-[180px] font-medium text-ink-900">{r.label}</td>
                <td className="tnum text-center">{r.count ?? r.value}</td>
                <td>
                  <div className="flex w-40 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={`h-full origin-left animate-grow-x rounded-full ${BAR_FILL}`}
                        style={{ width: `${Math.min(100, r.percent || 0)}%`, animationDelay: `${Math.min(i, 12) * 60}ms` }}
                      />
                    </div>
                    <span className="tnum w-10 text-right text-ink-700">{r.percent != null ? `${r.percent}%` : "—"}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Print-only breakdown table (formal, bar in the percent column) ───
function PrintTable({ title, rows }) {
  return (
    <div className="break-inside-avoid">
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-brand-900">{title}</h2>
      <table className="w-full border-collapse overflow-hidden rounded text-[10px] ring-1 ring-brand-900/30">
        <thead>
          <tr className="bg-brand-900 text-white">
            <th className="px-2 py-1 text-left font-semibold">Label</th>
            <th className="w-14 px-2 py-1 text-right font-semibold">Count</th>
            <th className="w-28 px-2 py-1 text-right font-semibold">Percent</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-2 py-2 text-center italic text-ink-400">No data available</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label} className="break-inside-avoid border-t border-ink-100 odd:bg-brand-50/60">
                <td className="[overflow-wrap:anywhere] px-2 py-0.5">{r.label}</td>
                <td className="tnum px-2 py-0.5 text-right">{r.count ?? r.value}</td>
                <td className="px-2 py-0.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, r.percent || 0)}%` }} />
                    </div>
                    <span className="tnum w-8 text-right">{r.percent != null ? `${r.percent}%` : "—"}</span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────
export default function ReportsFullPanel() {
  const [date, setDate] = useState(() => new Date());
  const [period, setPeriod] = useState(REGULAR_TIME_PERIODS[0]);
  const [timeCategory, setTimeCategory] = useState(TIME_CATEGORIES[0]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [regularYearInput, setRegularYearInput] = useState(String(TODAY_YEAR));
  const [regularMonth, setRegularMonth] = useState(TODAY_MONTH);
  const [weekIndex, setWeekIndex] = useState(null);
  // Regular Time Day uses the same continuous range model as Logbook. The
  // legacy multi-day selection stays intact for non-Day periods and Academic Time.
  const [dayRange, setDayRange] = useState(EMPTY_RANGE);
  const [selectedRegularMonths, setSelectedRegularMonths] = useState([TODAY_MONTH]);
  const [schoolStartYear, setSchoolStartYear] = useState(DEFAULT_SCHOOL_START_YEAR);
  const [semester, setSemester] = useState(SEMESTER_OPTIONS[0]);
  const [academicMonthRange, setAcademicMonthRange] = useState(EMPTY_RANGE);
  // Categorical department filter: an array of department IDs (empty = All).
  // Time-category and period controls remain single-value by design.
  const [department, setDepartment] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(EMPTY_DATA);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { mounted: pickerMounted, visible: pickerVisible } = useModalPresence(pickerOpen, GC_MODAL_CLOSE_MS);
  const pickerRef = useRef(null);
  const periodTriggerRef = useRef(null);
  const periodPanelRef = useRef(null);
  const periodOrigin = useTriggerOrigin({
    enabled: pickerOpen && pickerMounted,
    panelRef: periodPanelRef,
    triggerRef: periodTriggerRef,
  });

  const isContinuousDay = timeCategory === "Regular Time" && period === "Day";
  const today = useMemo(() => startOfDay(new Date()), []);
  const dayAnchorISO = dayRange.to || dayRange.from || toYMD(date);
  const [dayView, setDayView] = useState(
    () => new Date(date.getFullYear(), date.getMonth(), 1)
  );
  const [dayFocusISO, setDayFocusISO] = useState(dayAnchorISO);
  const [dayHoverISO, setDayHoverISO] = useState("");
  const academicMonthAnchorISO = academicMonthRange.to || academicMonthRange.from || toAcademicMonthISO(TODAY_YEAR, TODAY_MONTH);
  const [academicViewYear, setAcademicViewYear] = useState(TODAY_YEAR);
  const [academicMonthFocusISO, setAcademicMonthFocusISO] = useState(academicMonthAnchorISO);
  const [academicMonthHoverISO, setAcademicMonthHoverISO] = useState("");

  const { email } = useAuth();
  const adminName = email?.split("@")[0] || "Admin";

  // Real department list for the filter dropdown.
  useEffect(() => {
    masterlistApi
      .listDepartments()
      .then((rows) =>
        setDepartments(
          (rows || []).map((r) => ({
            id: r.department_id,
            name: r.department_name,
          }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isContinuousDay || !pickerOpen) return;
    const anchor = parseISODate(dayAnchorISO) || today;
    setDayView(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    setDayFocusISO(dayAnchorISO || toYMD(today));
    setDayHoverISO("");
  }, [isContinuousDay, pickerOpen, dayAnchorISO, today]);

  useEffect(() => {
    if (timeCategory !== "School-Based Time" || !pickerOpen) return;
    const anchor = parseAcademicMonthISO(academicMonthAnchorISO);
    if (!anchor) return;
    setAcademicViewYear(anchor.getFullYear());
    setAcademicMonthFocusISO(academicMonthAnchorISO);
    setAcademicMonthHoverISO("");
  }, [timeCategory, pickerOpen, academicMonthAnchorISO]);

  const academicMonthRangeKey = `${academicMonthRange.from}|${academicMonthRange.to}`;
  const academicDates = useMemo(
    () =>
      timeCategory === "School-Based Time"
        ? buildAcademicDates({ schoolStartYear, semester, monthRange: academicMonthRange })
        : [],
    [timeCategory, academicMonthRangeKey]
  );
  const academicDatesKey = academicDates.join("|");

  const regularYear = parseNonNegativeYear(regularYearInput);
  const dateKey = toYMD(date);
  const departmentKey = department.join("|");
  const selectedDaysKey = selectedDays.join("|");
  const selectedRegularMonthsKey = selectedRegularMonths.join(",");
  const dayRangeKey = `${dayRange.from}|${dayRange.to}`;
  const regularDates = useMemo(() => {
    if (isContinuousDay) {
      const pickedDays = dayRangeDates(dayRange);
      return pickedDays.length ? pickedDays : [dateKey];
    }
    return buildRegularTimeDates({
      period,
      date,
      selectedDays,
      weekYear: regularYear,
      weekMonth: regularMonth,
      weekIndex,
      monthsYear: regularYear,
      selectedMonths: selectedRegularMonths,
      year: regularYear,
    });
  }, [
    isContinuousDay,
    dayRangeKey,
    dateKey,
    period,
    selectedDaysKey,
    regularYear,
    regularMonth,
    weekIndex,
    selectedRegularMonthsKey,
  ]);
  const regularDatesKey = regularDates.join("|");

  const regularPeriodArgs = {
    period,
    date,
    selectedDays,
    weekYear: regularYear,
    weekMonth: regularMonth,
    weekIndex,
    monthsYear: regularYear,
    selectedMonths: selectedRegularMonths,
    year: regularYear,
  };

  // Real report data for the selected period (+ department filter). Each
  // selector expands to explicit dates and reuses the same reports endpoint;
  // a single active date keeps the original request shape unchanged. Multiple
  // selected departments fan out across that same endpoint and are merged,
  // so department selections are OR while the date/time mode stays unchanged.
  useEffect(() => {
    let cancelled = false;
    const departmentIds = normalizeReportDepartments(department);
    const deptId = departmentIds[0];

    async function loadReport() {
      if (!cancelled) setError(null);

      if (timeCategory === "School-Based Time") {
        if (academicDates.length === 0) {
          if (!cancelled) setData(EMPTY_DATA);
          return;
        }
        const responses = await fetchReportDates(academicDates, departmentIds, reportsApi.get);
        if (!cancelled) setData(mapResponse(mergeReportResponses(responses), academicDates.length));
        return;
      }

      if (regularDates.length === 0) {
        if (!cancelled) setData(EMPTY_DATA);
        return;
      }

      const singleDate =
        period === "All Time" ||
        (regularDates.length === 1 && regularDates[0] === dateKey);
      if (singleDate && departmentIds.length <= 1) {
        const json = await reportsApi.get({ date: toYMD(date), department_id: deptId });
        if (!cancelled) setData(mapResponse(json, 1));
        return;
      }

      const dates = singleDate ? [toYMD(date)] : regularDates;
      const responses = await fetchReportDates(dates, departmentIds, reportsApi.get);
      if (!cancelled) setData(mapResponse(mergeReportResponses(responses), dates.length));
    }

    loadReport().catch((err) => {
      if (!cancelled) {
        console.error("Failed to load report:", err);
        setError(err?.message || "Couldn't load report data. Please try again.");
        setData(EMPTY_DATA);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    timeCategory,
    dateKey,
    period,
    academicDatesKey,
    regularDatesKey,
    departmentKey,
  ]);

  const academicPeriodLabel = useMemo(
    () => formatAcademicPeriodLabel({ schoolStartYear, semester, monthRange: academicMonthRange }),
    [schoolStartYear, semester, academicMonthRangeKey]
  );
  const periodLabel =
    timeCategory === "School-Based Time"
      ? academicPeriodLabel
      : isContinuousDay
        ? dayRangeLabel(dayRange) || formatDateLabel(dateKey)
        : formatRegularPeriodLabel(regularPeriodArgs);
  const canOpenPicker = timeCategory === "School-Based Time" || period !== "All Time";
  const departmentLabel = formatFilterSelectionLabel({
    selected: department,
    options: departments.map((d) => ({ value: d.id, label: d.name })),
    allLabel: "All Departments",
    pluralLabel: "Departments",
  });

  function handleTimeCategoryChange(nextCategory) {
    setTimeCategory(nextCategory);
    setPickerOpen(false);

    if (nextCategory === "Regular Time") {
      const normalized = normalizeRegularTimePeriod(period);
      if (normalized === "Day") {
        setDayRange(EMPTY_RANGE);
        syncRegularAnchorDate(date);
      }
      setPeriod(normalized);
      return;
    }

    setSchoolStartYear((current) => parseNonNegativeYear(current) ?? DEFAULT_SCHOOL_START_YEAR);
    setSemester((current) => (SEMESTER_OPTIONS.includes(current) ? current : SEMESTER_OPTIONS[0]));
  }

  function handleSchoolStartYearChange(nextYear) {
    // Keep the raw input value so an empty/invalid year can be shown cleanly.
    setSchoolStartYear(nextYear);
  }

  function handleSemesterChange(nextSemester) {
    setSemester(nextSemester);
  }

  function handlePickAcademicMonth(iso) {
    const next = pickRangeDate(academicMonthRange, iso);
    setAcademicMonthRange(next);
    const picked = parseAcademicMonthISO(iso);
    if (picked) setAcademicViewYear(picked.getFullYear());
    setAcademicMonthFocusISO(iso);
  }

  function handleClearAcademicMonthRange() {
    setAcademicMonthRange(EMPTY_RANGE);
    setAcademicViewYear(TODAY_YEAR);
    setAcademicMonthFocusISO(toAcademicMonthISO(TODAY_YEAR, TODAY_MONTH));
    setAcademicMonthHoverISO("");
  }

  function syncRegularAnchorDate(nextDate) {
    if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) return;
    setDate(nextDate);
    setRegularYearInput(String(nextDate.getFullYear()));
    setRegularMonth(nextDate.getMonth());
    setSelectedRegularMonths([nextDate.getMonth()]);
    setWeekIndex(null);
  }

  function handlePickDay(iso) {
    const next = pickRangeDate(dayRange, iso);
    setDayRange(next);
    const picked = parseISODate(iso);
    if (picked) syncRegularAnchorDate(picked);
    setDayFocusISO(iso);
  }

  function handleClearDayRange() {
    setDayRange(EMPTY_RANGE);
    syncRegularAnchorDate(today);
    setDayFocusISO(toYMD(today));
    setDayHoverISO("");
  }

  function handleToggleDay(nextDate) {
    const nextSelection = toggleRegularDay(selectedDays, toYMD(nextDate));
    setSelectedDays(nextSelection);
    if (nextSelection.length) syncRegularAnchorDate(nextDate);
  }

  function handleSelectDay(nextDate) {
    syncRegularAnchorDate(nextDate);
    setSelectedDays([]);
  }

  function applyRegularPatch(patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "date")) setDate(patch.date);
    if (Object.prototype.hasOwnProperty.call(patch, "selectedDays")) setSelectedDays(patch.selectedDays);
    if (Object.prototype.hasOwnProperty.call(patch, "yearInput")) setRegularYearInput(patch.yearInput);
    if (Object.prototype.hasOwnProperty.call(patch, "month")) {
      setRegularMonth(patch.month);
      setWeekIndex(null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "weekIndex")) setWeekIndex(patch.weekIndex);
    if (Object.prototype.hasOwnProperty.call(patch, "selectedRegularMonths")) {
      setSelectedRegularMonths(patch.selectedRegularMonths);
    }
  }

  function shiftPeriod(delta) {
    if (isContinuousDay) {
      const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : today;
      const nextDate = new Date(source);
      nextDate.setDate(nextDate.getDate() + (Number(delta) < 0 ? -1 : 1));
      syncRegularAnchorDate(nextDate);
      setDayRange(shiftDayRange(dayRange, delta));
      return;
    }

    applyRegularPatch(shiftRegularSelection({
      period,
      date,
      selectedDays,
      weekYear: regularYear,
      weekMonth: regularMonth,
      weekIndex,
      monthsYear: regularYear,
      selectedMonths: selectedRegularMonths,
      year: regularYear,
    }, delta));
  }

  // KPI derived values
  const totalConsultations = data.totalAppointments;
  const totalStudents = data.totalStudents;
  const dailyAverage = useMemo(
    () => getDailyAverage(totalConsultations, data.dayCount),
    [totalConsultations, data.dayCount]
  );
  const dailyAverageLabel = formatDailyAverage(dailyAverage);
  const topComplaint = useMemo(() => {
    if (data.complaint.rows.length === 0) return "—";
    const sorted = [...data.complaint.rows].sort((a, b) => (b.percent || 0) - (a.percent || 0));
    return sorted[0]?.label || "—";
  }, [data.complaint.rows]);

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 18;

      // Letterhead — shared helper (now embeds the same three seal images
      // used on-screen/print, so the download matches the printed page).
      y = await pdfLetterhead(doc, y);

      // ── Title ────────────────────────────────────────────────────
      doc.setFontSize(13);
      doc.setFont(undefined, "bold");
      doc.text("Clinic Consultation Report", 105, y, { align: "center" });
      y += 5;

      // ── Subtitle / metadata ──────────────────────────────────────
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(
        `${periodLabel}  |  ${departmentLabel}  |  Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  |  Generated by: ${adminName}`,
        105,
        y,
        { align: "center" }
      );
      y += 7;

      // ── Helper: bordered table row (full cell grid, matching the
      // border-gray-400/300 table used on-screen/print) ────────────────
      const summaryLx = 14;
            const summaryRx = 196;
      const summaryRowH = 5;
      let summaryTop = y - 3.5;

      let zebra = 0;
      function drawRow(label, value, isHeader = false) {
        const lx = summaryLx;
        const rx = summaryRx;
        const rowH = summaryRowH;

        if (isHeader) {
          doc.setFillColor(4, 75, 14); // brand-900
          doc.rect(lx, y - 3.5, rx - lx, rowH, "F");
          doc.setTextColor(255);
        } else if (zebra++ % 2 === 1) {
          doc.setFillColor(238, 247, 240); // brand-50
          doc.rect(lx, y - 3.5, rx - lx, rowH, "F");
        }

        doc.setFont(undefined, isHeader ? "bold" : "normal");
        doc.text(label, lx + 1, y);
        doc.text(String(value), rx - 1, y, { align: "right" });
        doc.setTextColor("#000000");
        y += rowH;
      }

      // ── Executive Summary ────────────────────────────────────────
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text("Executive Summary", 14, y);
      y += 5;

      doc.setFontSize(9);
      summaryTop = y - 3.5;
      drawRow("Metric", "Value", true);
      drawRow("Total Consultations", totalConsultations.toLocaleString());
      drawRow("Total Students", totalStudents.toLocaleString());
      drawRow("Daily Average", dailyAverageLabel);
      drawRow("Calendar Days", data.dayCount.toLocaleString());
      drawRow("Top Complaint", topComplaint);
      drawRow("Date Range", periodLabel);
      drawRow("Department", departmentLabel);

      // Full grid over the summary table: outer box, horizontal row lines,
      // and one vertical divider at the label/value midpoint.
      doc.setDrawColor(214, 219, 215);
      doc.setLineWidth(0.15);
      const summaryBottom = y - 3.5;
      for (let ly = summaryTop; ly <= summaryBottom + 0.01; ly += summaryRowH) {
        doc.line(summaryLx, ly, summaryRx, ly);
      }
      y += 4;

      // ── Breakdown tables ─────────────────────────────────────────
      const sections = [
        { title: "Reason for Visit", rows: data.reason.rows },
        { title: "Complaint", rows: data.complaint.rows },
        { title: "Department", rows: data.department.rows },
        { title: "Sex", rows: data.sex.rows },
        { title: "Age Group", rows: data.age.rows },
      ];

      sections.forEach((section) => {
        // Page break check
        if (y > 230) {
          doc.addPage();
          y = 18;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.setTextColor("#044B0E");
        doc.text(section.title.toUpperCase(), 14, y);
        doc.setTextColor("#000000");
        y += 5;

        const lx = 14;
                const div2 = 166; // Count / Percent boundary
        const rx = 196;
        const bkRowH = 5;
        let bkTop = y - 3.5;

        // Table header
        doc.setFontSize(9);
        doc.setFillColor(4, 75, 14);
        doc.rect(lx, y - 3.5, rx - lx, bkRowH, "F");
        doc.setFont(undefined, "bold");
        doc.setTextColor(255);
        doc.text("Label", lx + 1, y);
        doc.text("Count", div2 - 1, y, { align: "right" });
        doc.text("Percent", rx - 1, y, { align: "right" });
        doc.setTextColor("#000000");
        y += bkRowH;

        function drawBkGrid(top, bottom) {
          doc.setDrawColor(214, 219, 215);
          doc.setLineWidth(0.15);
          for (let ly = top; ly <= bottom + 0.01; ly += bkRowH) {
            doc.line(lx, ly, rx, ly);
          }
        }

        // Table rows
        doc.setFont(undefined, "normal");
        const rowsToRender = section.rows.length ? section.rows : [null];
        rowsToRender.forEach((row, ri) => {
          if (row !== null && ri % 2 === 1) {
            doc.setFillColor(238, 247, 240);
            doc.rect(lx, y - 3.5, rx - lx, bkRowH, "F");
          }
          if (y > 270) {
            // Close out the grid drawn so far before breaking to a new page.
            drawBkGrid(bkTop, y - 3.5);
            doc.addPage();
            y = 18;
            bkTop = y - 3.5;
          }
          if (row === null) {
            doc.setFont(undefined, "italic");
            doc.setTextColor(150);
            doc.text("No data available", lx + 1, y);
            doc.setFont(undefined, "normal");
            doc.setTextColor("#000000");
          } else {
            doc.text(String(row.label), lx + 1, y);
            doc.text(String(row.count ?? row.value), div2 - 1, y, { align: "right" });
            doc.text(row.percent != null ? `${row.percent}%` : "—", rx - 1, y, { align: "right" });
          }
          y += bkRowH;
        });

        drawBkGrid(bkTop, y - 3.5);
        y += 4;
      });

      // ── Footer sign-off ──────────────────────────────────────────
      if (y > 230) {
        doc.addPage();
        y = 18;
      }
      y += 4;
      doc.setDrawColor(180);
      doc.line(14, y, 196, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.text(`Prepared by: ${adminName}`, 14, y);
      doc.text("Noted by:", 120, y);
      y += 12;

      doc.setFont(undefined, "normal");
      doc.text("__________________________", 14, y);
      doc.text("__________________________", 120, y);
      y += 4;
      doc.setFontSize(8);
      doc.text("Signature over Printed Name", 14, y);
      doc.text("Signature over Printed Name", 120, y);
      y += 8;

      // Disclaimer
      doc.setFontSize(7);
      doc.setFont(undefined, "italic");
      doc.setTextColor(120);
      doc.text(
        'This report is system-generated. Entries with "No complaint logged" have been excluded from the complaint breakdown.',
        105,
        y,
        { align: "center" }
      );
      y += 4;

      // Real page numbers (the old footer always said "Page 1 of 1").
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont(undefined, "normal");
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, 196, 290, { align: "right" });
      }

      const reportFileLabel =
        timeCategory === "School-Based Time"
          ? formatAcademicPeriodFileLabel({ schoolStartYear, semester, monthRange: academicMonthRange })
          : formatRegularFileLabel(regularPeriodArgs);
      doc.save(`clinic-report-${reportFileLabel}.pdf`);
      setError(null);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      setError("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const generatedLong = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const topPct = data.complaint.rows[0]?.percent ?? 0;

  return (
    <section className="print-a4-portrait space-y-5">
      {error && (
        <div role="alert" className="flex animate-fade-in items-center justify-between gap-2 rounded-card border border-signal-rose-ring bg-signal-rose-bg px-4 py-3 text-sm text-signal-rose print:hidden">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}

      {/* ═══════════════ SCREEN DASHBOARD (hidden on print) ═══════════════ */}
      <div className="stagger space-y-5 print:hidden">
        {/* Page header */}
        <PageHeader
          title="Reports"
          subtitle="Clinic analytics &amp; statistics"
          icon={<NavIcon name="chart" className="h-5 w-5" />}
          actions={
            <>
              <PrintButton onClick={handlePrint} />
              <DownloadPdfButton
                onClick={handleDownloadPdf}
                disabled={downloading}
                loading={downloading}
              />
            </>
          }
        />

        {/* Filter toolbar (no overflow-hidden: the date popover must escape it) */}
        <div className="relative z-30 rounded-panel bg-white p-3 shadow-e2 md:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex min-w-0 flex-1 items-center gap-1.5" ref={pickerRef}>
              {timeCategory === "Regular Time" && period !== "All Time" && (
                <button
                  onClick={() => shiftPeriod(-1)}
                  aria-label={`Previous ${period.toLowerCase()}`}
                  className="icon-btn h-9 w-9 shrink-0 rounded-control border border-ink-200 text-ink-500 hover:bg-ink-50"
                >
                  <NavIcon name="chevron-left" className="h-4 w-4" />
                </button>
              )}
              <CalendarTriggerButton
                ref={periodTriggerRef}
                onClick={() => canOpenPicker && setPickerOpen((v) => !v)}
                aria-haspopup={canOpenPicker ? "dialog" : undefined}
                aria-expanded={pickerOpen}
                aria-label="Select report period"
                title={periodLabel}
                className="min-w-0 flex-1"
              >
                {periodLabel}
              </CalendarTriggerButton>
              {timeCategory === "Regular Time" && period !== "All Time" && (
                <button
                  onClick={() => shiftPeriod(1)}
                  aria-label={`Next ${period.toLowerCase()}`}
                  className="icon-btn h-9 w-9 shrink-0 rounded-control border border-ink-200 text-ink-500 hover:bg-ink-50"
                >
                  <NavIcon name="chevron-right" className="h-4 w-4" />
                </button>
              )}
              {pickerMounted && (
                <PortalOverlay
                  triggerRef={periodTriggerRef}
                  panelRef={periodPanelRef}
                  enabled={pickerMounted}
                  align="left"
                  preferredWidth={320}
                  estimatedHeight={420}
                  role="dialog"
                  ariaLabel="Select report period"
                  className={`gc-modal-panel ${isContinuousDay ? "gc-reports-day-pop" : ""} ${
                    periodOrigin.className
                  } ${pickerVisible ? "is-open" : "is-close"}`}
                  style={periodOrigin.style}
                  onOutside={() => setPickerOpen(false)}
                  onEscape={() => setPickerOpen(false)}
                >
                  {timeCategory === "School-Based Time" ? (
                    <SchoolBasedPeriodPicker
                      schoolStartYear={schoolStartYear}
                      semester={semester}
                      monthRange={academicMonthRange}
                      viewYear={academicViewYear}
                      setViewYear={setAcademicViewYear}
                      focusISO={academicMonthFocusISO}
                      setFocusISO={setAcademicMonthFocusISO}
                      hoverISO={academicMonthHoverISO}
                      setHoverISO={setAcademicMonthHoverISO}
                      onSchoolStartYearChange={handleSchoolStartYearChange}
                      onSemesterChange={handleSemesterChange}
                      onMonthRangePick={handlePickAcademicMonth}
                      onClearMonthRange={handleClearAcademicMonthRange}
                    />
                  ) : isContinuousDay ? (
                    <>
                      <div className="border-b border-ink-100 px-4 py-3">
                        <p className="text-sm font-semibold text-ink-900">Regular Time · Day</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Selected: {dayRangeLabel(dayRange) || formatDateLabel(dateKey)}
                        </p>
                      </div>
                      <RangeCalendarPanel
                        value={dayRange}
                        today={today}
                        view={dayView}
                        setView={setDayView}
                        focusISO={dayFocusISO}
                        setFocusISO={setDayFocusISO}
                        hoverISO={dayHoverISO}
                        setHoverISO={setDayHoverISO}
                        onPick={handlePickDay}
                        onClear={handleClearDayRange}
                        hint={
                          dayRange.from && dayRange.to
                            ? "Pick a date to start a new range"
                            : dayRange.from
                              ? "Select end date"
                              : "Select start and end date"
                        }
                      />
                    </>
                  ) : (
                    <RegularTimePeriodPicker
                      period={period}
                      date={date}
                      selectedDays={selectedDays}
                      yearInput={regularYearInput}
                      month={regularMonth}
                      weekIndex={weekIndex}
                      selectedMonths={selectedRegularMonths}
                      onToggleDay={handleToggleDay}
                      onSelectDay={handleSelectDay}
                      onYearInputChange={setRegularYearInput}
                      onMonthChange={(nextMonth) => {
                        setRegularMonth(nextMonth);
                        setWeekIndex(null);
                      }}
                      onWeekChange={setWeekIndex}
                      onMonthsChange={setSelectedRegularMonths}
                      onDone={() => setPickerOpen(false)}
                    />
                  )}
                </PortalOverlay>
              )}
            </div>

            <div className="hidden h-8 w-px shrink-0 bg-ink-100 sm:block" />

            <div className="flex items-center gap-2">
              <UniversalDropdown
                value={timeCategory}
                onChange={handleTimeCategoryChange}
                options={TIME_CATEGORY_OPTIONS}
                className="w-full sm:w-44"
              />
              {timeCategory === "Regular Time" && (
                <PeriodDropdown
                  value={period}
                  onChange={(next) => {
                    const normalized = normalizeRegularTimePeriod(next);
                    if (
                      timeCategory === "Regular Time" &&
                      normalized === "Day" &&
                      period !== "Day"
                    ) {
                      setDayRange(EMPTY_RANGE);
                      syncRegularAnchorDate(date);
                    }
                    setPeriod(normalized);
                  }}
                />
              )}
              <FilterMultiSelect
                value={department}
                onChange={setDepartment}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                allLabel="All Departments"
                pluralLabel="Departments"
                ariaLabel="Filter by department"
                triggerTestId="reports-department-filter"
                className="w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Consultations" value={totalConsultations} icon={<NavIcon name="chart" className="h-5 w-5" />} />
          <KpiCard label="Total Students" value={totalStudents} icon={<NavIcon name="user" className="h-5 w-5" />} />
          <KpiCard
            label="Daily Average"
            value={dailyAverage ?? 0}
            icon={<NavIcon name="clock" className="h-5 w-5" />}
          />
          <KpiCard
            label="Top Complaint"
            text={topComplaint}
            badge={topComplaint !== "—" ? `${topPct}% of total` : undefined}
            icon={<NavIcon name="feedback" className="h-5 w-5" />}
          />
        </div>

        {/* Breakdowns */}
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
          <BreakdownCard title="Reason for Visit" rows={data.reason.rows} />
          <BreakdownCard title="Department" rows={data.department.rows} />
          <BreakdownCard title="Sex" rows={data.sex.rows} />
          <BarChartCard title="Age Group" rows={data.age.rows} />
          <RankTable title="Most common complaints" rows={data.complaint.rows} className="md:col-span-2" />
        </div>
      </div>

      {/* ═══════════════ PRINT LAYOUT (A4, hidden on screen) ═══════════════ */}
      <div className="report-print hidden space-y-4 print:block">
        <Letterhead className="mb-3 hidden items-center gap-3 border-b-2 border-brand-900 pb-3 print:flex" />

        {/* Title block */}
        <div className="text-center">
          <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-900">Clinic Consultation Report</h1>
          <div className="mx-auto mt-1.5 h-0.5 w-16 rounded-full bg-gold-400" />
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-4 divide-x divide-ink-200 rounded border border-ink-200 bg-ink-50 text-[9px]">
          {[
            ["Period", periodLabel],
            ["Department", departmentLabel],
            ["Generated", generatedLong],
            ["Prepared by", adminName],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 px-2 py-1.5">
              <p className="font-bold uppercase tracking-wider text-ink-500">{k}</p>
              <p className="mt-0.5 [overflow-wrap:anywhere] font-medium text-ink-900">{v}</p>
            </div>
          ))}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2">
          {[
            ["Total Consultations", totalConsultations.toLocaleString()],
            ["Total Students", totalStudents.toLocaleString()],
            ["Daily Average", dailyAverageLabel],
            ["Top Complaint", topComplaint],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded border border-brand-900/25 bg-brand-50 px-3 py-2">
              <p className="text-[8px] font-bold uppercase tracking-wider text-brand-800">{k}</p>
              <p className="mt-0.5 [overflow-wrap:anywhere] text-sm font-bold leading-tight text-brand-900">{v}</p>
            </div>
          ))}
        </div>

        <PrintTable title="Reason for Visit" rows={data.reason.rows} />
        <PrintTable title="Complaint" rows={data.complaint.rows} />
        <PrintTable title="Department" rows={data.department.rows} />
        <div className="grid grid-cols-2 items-start gap-4">
          <PrintTable title="Sex" rows={data.sex.rows} />
          <PrintTable title="Age Group" rows={data.age.rows} />
        </div>

        {/* Sign-off */}
        <div className="mt-6 break-inside-avoid border-t-2 border-brand-900 pt-4">
          <div className="mb-4 flex justify-between text-[10px] text-ink-900">
            <div>
              <p className="font-semibold">Prepared by: {adminName}</p>
              <p className="mt-8 w-44 border-t border-ink-700 pt-1">Signature over Printed Name</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Noted by:</p>
              <p className="ml-auto mt-8 w-44 border-t border-ink-700 pt-1">Signature over Printed Name</p>
            </div>
          </div>
          <p className="text-center text-[8px] text-ink-500">
            This report is system-generated. Entries with &quot;No complaint logged&quot; have been excluded from the complaint breakdown.
          </p>
        </div>
      </div>
    </section>
  );
}
