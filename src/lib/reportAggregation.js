// Helpers for combining the existing single-date reports endpoint into one
// report for a school-based month set. No backend/schema changes required.
// Categorical department filters fan out across the same scalar endpoint and
// are merged here; dates and time-category selection logic stays untouched.

const BREAKDOWN_KEYS = [
  "status_breakdown",
  "reason_breakdown",
  "department_breakdown",
  "complaint_breakdown",
  "sex_breakdown",
  "age_breakdown",
];

function roundPercent(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

export function mergeReportResponses(responses) {
  const reports = (Array.isArray(responses) ? responses : []).filter(Boolean);
  const totalAppointments = reports.reduce(
    (sum, report) => sum + (Number(report.total_appointments) || 0),
    0
  );
  const totalStudents = reports.reduce(
    (sum, report) => sum + (Number(report.total_students) || 0),
    0
  );

  const merged = {
    date: reports[0]?.date ?? null,
    department_id: reports[0]?.department_id ?? null,
    total_appointments: totalAppointments,
    total_students: totalStudents,
  };

  for (const key of BREAKDOWN_KEYS) {
    const counts = new Map();
    for (const report of reports) {
      for (const row of report[key] || []) {
        const label = row.label ?? "";
        counts.set(label, (counts.get(label) || 0) + (Number(row.count) || 0));
      }
    }
    merged[key] = [...counts.entries()]
      .map(([label, count]) => ({
        label,
        count,
        percent: roundPercent(count, totalAppointments),
      }))
      .sort((a, b) => b.count - a.count);
  }

  return merged;
}

// Accept the legacy scalar `departmentId` as well as the multi-select array.
// Empty / "All Departments" means no department filter. IDs are kept in their
// original type so a single selection still produces the old numeric param.
export function normalizeReportDepartments(value) {
  const raw = Array.isArray(value) ? value : [value]
  const seen = new Set()
  const result = []
  for (const item of raw) {
    const text = item === null || item === undefined ? "" : String(item).trim()
    if (!text || text === "All Departments" || seen.has(text)) continue
    seen.add(text)
    result.push(item)
  }
  return result
}

// One request per date x department. This is OR across departments: a student
// belongs to exactly one department, so summing the scalar RPC responses gives
// the union. Dates keep their existing fan-out behavior.
export function buildReportRequests(dates, departments) {
  const list = Array.isArray(dates) ? dates : []
  if (list.length === 0) return []

  const departmentIds = normalizeReportDepartments(departments)
  if (departmentIds.length === 0) {
    return list.map((date) => ({ date, department_id: undefined }))
  }

  return list.flatMap((date) =>
    departmentIds.map((department_id) => ({ date, department_id }))
  )
}

export async function fetchReportDates(dates, departments, getReport, concurrency = 6) {
  const requests = buildReportRequests(dates, departments)
  if (requests.length === 0) return []

  const results = new Array(requests.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < requests.length) {
      const index = nextIndex++;
      results[index] = await getReport(requests[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), requests.length) }, worker)
  );
  return results;
}
