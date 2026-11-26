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
  return buildAppointmentOptionValues(slots, "course");
}

export function buildAppointmentReasonOptions(slots) {
  return buildAppointmentOptionValues(slots, "reason");
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
        const name = String(booking.name ?? "").toLowerCase();
        const dept = String(booking.dept ?? "");
        const courseName = String(booking.course ?? "");
        const matchesSearch =
          !query ||
          name.includes(query) ||
          dept.toLowerCase().includes(query);
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
