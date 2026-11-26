// Shared Appointments-page filtering. Kept separate from the panel so the
// visibility rule can be regression-tested without rendering React.

import { isFilterSelected } from "./filterMultiSelect.js";

// Legacy scalar "All ..." sentinels. Callers may still pass one of these
// (or a plain value) instead of the multi-select array; both keep working.
const ALL_DEPARTMENTS = "All Department";
const ALL_REASONS = "All Reason";
const ALL_COURSES = "All Courses";

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Appointments may arrive with a plain `course`, a `course_name` from a joined
// reference row, or the legacy `Course - Department` shape. Read the real
// value from whichever field the endpoint supplied; never invent one.
export function appointmentCourseValue(booking) {
  const direct = String(booking?.course ?? "").trim();
  if (direct && direct !== "-") return direct;

  const named = String(booking?.course_name ?? "").trim();
  if (named && named !== "-") return named;

  const combined = String(booking?.deptCourse ?? "").trim();
  const parsed = combined.split(" - ")[0].trim();
  return parsed && parsed !== "-" ? parsed : "";
}

// One search rule shared by the visible blocks and the option derivation, so
// typing a course name cannot make the Courses dropdown look empty while the
// same record is still present in the loaded slots. `extraFields` lets another
// record-backed screen (Logbook) add its own columns without forking the rule.
export function matchesAppointmentSearch(booking, search = "", extraFields = []) {
  const query = String(search ?? "").trim().toLowerCase();
  if (!query) return true;

  return [
    booking?.name,
    booking?.student_id,
    booking?.studentId,
    booking?.dept,
    appointmentCourseValue(booking),
    booking?.deptCourse,
    ...(Array.isArray(extraFields) ? extraFields : []),
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

// One category match: an array is an OR set (empty = All), a scalar is the
// legacy single-value equality check with the old "All ..." sentinels.
function matchesCategory(filter, value) {
  if (Array.isArray(filter)) return isFilterSelected(value, filter);
  const text = String(filter ?? "").trim();
  if (!text || text === ALL_DEPARTMENTS || text === ALL_REASONS || text === ALL_COURSES) {
    return true;
  }
  return String(value ?? "") === text;
}

// Filter options are derived from the loaded slots. The caller supplies the
// "All" label through FilterMultiSelect's allLabel, so these return only real
// values (never an "All ..." row mixed into the option list).
export function buildAppointmentOptionValues(slots, field) {
  const values = new Set();
  (Array.isArray(slots) ? slots : []).forEach((slot) => {
    (Array.isArray(slot?.bookings) ? slot.bookings : []).forEach((booking) => {
      const value = String(booking?.[field] ?? "").trim();
      if (value && value !== "-") values.add(value);
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function buildAppointmentDepartmentOptions(slots) {
  return buildAppointmentOptionValues(slots, "dept");
}

export function buildAppointmentCourseOptions(slots) {
  const values = new Set();
  (Array.isArray(slots) ? slots : []).forEach((slot) => {
    (Array.isArray(slot?.bookings) ? slot.bookings : []).forEach((booking) => {
      const value = appointmentCourseValue(booking);
      if (value) values.add(value);
    });
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function buildAppointmentReasonOptions(slots) {
  return buildAppointmentOptionValues(slots, "reason");
}

// Body sent with a persisted time-block deletion. Virtual slots have a
// negative id and no database row, so the date/time scope travels with them.
export function timeSlotDeletePayload(slot, date) {
  const [timeStart = "", timeEnd = ""] = String(slot?.time ?? "").split(" - ");
  return {
    date,
    slot_start: slot?.slot_start || timeStart,
    slot_end: slot?.slot_end || timeEnd,
    schedule_id: slot?.schedule_id ?? null,
    reason_id: slot?.reason_id ?? null,
  };
}

export function filterAppointmentSlots(
  slots,
  { search = "", department = [], course = [], reason = [] } = {}
) {
  const query = String(search ?? "").trim().toLowerCase();

  return (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const sourceBookings = Array.isArray(slot.bookings) ? slot.bookings : [];
      const activeBookings = sourceBookings.filter(
        (booking) => normalizeStatus(booking.status) !== "cancelled"
      );
      const activeCount = activeBookings.length;
      const capacity = Number(slot.capacity) || 0;

      // Visibility is based on the appointment records that will actually be
      // rendered, not on a backend "booked" number that could disagree.
      const bookings = activeBookings.filter((booking) => {
        const dept = String(booking.dept ?? "");
        const courseName = appointmentCourseValue(booking);
        const matchesSearch = matchesAppointmentSearch(booking, query);
        // OR within each category, AND across categories.
        const matchesDepartment = matchesCategory(department, dept);
        const matchesCourse = matchesCategory(course, courseName);
        const matchesReason = matchesCategory(reason, booking.reason);
        return matchesSearch && matchesDepartment && matchesCourse && matchesReason;
      });

      return {
        ...slot,
        bookings,
        booked: activeCount,
        slotsLeft: Math.max(capacity - activeCount, 0),
        full: activeCount >= capacity,
      };
    })
    .filter((slot) => slot.bookings.length > 0);
}
