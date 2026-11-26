// Regular Time periods for Reports. Academic periods (Semester / Academic Year)
// belong only to Academic Timeline and are handled by academicPeriod.js.

export const REGULAR_TIME_PERIODS = ["Day", "Week", "Month", "Year", "All Time"];

export function normalizeRegularTimePeriod(period) {
  return REGULAR_TIME_PERIODS.includes(period) ? period : REGULAR_TIME_PERIODS[0];
}
