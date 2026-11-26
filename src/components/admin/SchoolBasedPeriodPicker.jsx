// Academic Timeline controls for Reports. The first academic year is a
// numeric non-negative input; the second year is derived and read-only.
// Semester is independent, and months are selected as one continuous range
// through the same calendar panel used by Reports Regular Time Day.
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import NavIcon from "../ui/NavIcon.jsx";
import { MonthRangeCalendarPanel } from "../ui/DateRangePicker.jsx";
import {
  formatAcademicMonthRangeLabel,
  formatSemesterDisplayLabel,
  getSchoolYearRange,
  SEMESTER_OPTIONS,
} from "../../lib/academicPeriod.js";
import { parseNonNegativeYear } from "../../lib/reportPeriodSelection.js";

export default function SchoolBasedPeriodPicker({
  schoolStartYear,
  semester,
  monthRange,
  viewYear,
  setViewYear,
  focusISO,
  setFocusISO,
  hoverISO,
  setHoverISO,
  onSchoolStartYearChange,
  onSemesterChange,
  onMonthRangePick,
  onClearMonthRange,
}) {
  const parsedYear = parseNonNegativeYear(schoolStartYear);
  const range = parsedYear == null ? null : getSchoolYearRange(parsedYear);
  const rangeLabel = formatAcademicMonthRangeLabel(monthRange);

  return (
    <section className="card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      <h2 className="text-center font-bold text-gray-800 text-sm md:text-base mb-1">
        Academic Timeline
      </h2>
      <p className="mb-1 text-center text-xs font-semibold text-gray-600">
        AY: {range?.startYear ?? "—"} – {range?.endYear ?? "—"} · {formatSemesterDisplayLabel(semester)}
      </p>
      <p className="mb-3 text-center text-[11px] font-medium text-gray-500">
        {rangeLabel || "Select start and end month"}
      </p>

      <div className="grid grid-cols-2 items-end gap-3">
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Academic Year
          </span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            aria-label="Academic Year"
            value={schoolStartYear ?? ""}
            onChange={(event) => onSchoolStartYearChange(event.target.value)}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:border-gc-green focus:ring-2 focus:ring-gc-green/20"
          />
        </label>
        <div className="min-w-0">
          <div
            aria-label="Academic year end year"
            aria-readonly="true"
            className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700"
          >
            <NavIcon name="calendar" className="w-4 h-4 shrink-0 text-gc-green" />
            <span aria-hidden="true">–</span>
            <span>{range?.endYear ?? "—"}</span>
          </div>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Semester
        </span>
        <UniversalDropdown
          value={semester}
          onChange={onSemesterChange}
          options={SEMESTER_OPTIONS}
          className="w-full"
          buttonClassName="h-9"
        />
      </label>

      <div className="mt-4">
        <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Select month range
        </span>
        <MonthRangeCalendarPanel
          value={monthRange}
          viewYear={viewYear}
          setViewYear={setViewYear}
          focusISO={focusISO}
          setFocusISO={setFocusISO}
          hoverISO={hoverISO}
          setHoverISO={setHoverISO}
          onPick={onMonthRangePick}
          onClear={onClearMonthRange}
          hint={monthRange?.from && !monthRange?.to ? "Select end month" : "Select start and end month"}
        />
      </div>
    </section>
  );
}
