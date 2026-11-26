import { formatMiddleInitial } from "./format.js"

export function formatDate(value) {
  if (!value) return "-"
  try {
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`)
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate()
    ).padStart(2, "0")}/${d.getFullYear()}`
  } catch {
    return String(value)
  }
}

export const CONDITION_FIELDS = [
  "has_asthma", "has_chicken_pox", "has_diabetes", "has_dysmenorrhea",
  "has_epilepsy_seizure", "has_heart_disorder", "has_hepatitis",
  "has_hypertension", "has_measles", "has_mumps", "has_anxiety_disorder",
  "has_panic_attack", "has_pneumonia", "has_tb_primary_complex",
  "has_typhoid_fever", "has_covid19", "has_urinary_tract_infection",
]

function adaptEmergencyContact(ec) {
  const hasStructuredName = ["first_name", "middle_initial", "last_name", "suffix"]
    .some((key) => String(ec[key] ?? "").trim() !== "")
  const name = ec.contact_name ?? ec.name ?? "-"
  return {
    name,
    firstName: ec.first_name ?? "",
    middleName: ec.middle_initial ?? "",
    lastName: ec.last_name ?? "",
    suffix: ec.suffix ?? "",
    legacyName: hasStructuredName ? "" : (name === "-" ? "" : name),
    relationship: ec.relationship ?? "-",
    contactNumber: ec.contact_number ?? ec.phone_number ?? ec.phone ?? "-",
    sameAsStudentAddress: ec.same_as_student_address === true,
    presentAddress: ec.present_address ?? "-",
    legacyAddress: ec.present_address ?? "",
    addressRegion: ec.address_region_code ?? "",
    addressProvince: ec.address_province_code ?? "",
    addressCity: ec.address_city_code ?? "",
    addressBarangay: ec.address_barangay_code ?? "",
    addressStreet: ec.address_street ?? "",
    addressHouseNumber: ec.address_house_number ?? "",
  }
}

export function adaptStudent(profile, medSummary) {
  if (!profile) return null
  const middleInitial = formatMiddleInitial(profile.middle_initial)
  const middle = middleInitial ? ` ${middleInitial}` : ""
  const ec = medSummary?.emergency_contact || {}
  const history = medSummary?.medical_history || {}
  return {
    studentId: profile.student_id,
    studentNumber: profile.student_id || "",
    name: `${profile.last_name ?? ""}, ${profile.first_name ?? ""}${middle}`.trim(),
    firstName: profile.first_name,
    middleName: profile.middle_initial ?? "",
    lastName: profile.last_name,
    suffix: profile.suffix ?? "",
    birthday: formatDate(profile.birth_date),
    sex: profile.gender ?? "-",
    civilStatus: profile.civil_status ?? "-",
    contactNumber: profile.contact_number ?? "-",
    presentAddress: profile.present_address ?? "-",
    legacyAddress: profile.present_address ?? "",
    addressRegion: profile.address_region_code ?? "",
    addressProvince: profile.address_province_code ?? "",
    addressCity: profile.address_city_code ?? "",
    addressBarangay: profile.address_barangay_code ?? "",
    addressStreet: profile.address_street ?? "",
    addressHouseNumber: profile.address_house_number ?? "",
    yearLevel: profile.year_level ?? "-",
    course: profile.course_name ?? "-",
    department: profile.department_name ?? "-",
    deptCourse: `${profile.course_name ?? "-"} / ${profile.department_name ?? "-"}`,
    departmentId: profile.department_id ?? "",
    courseId: profile.course_id ?? "",
    photo: profile.photo ?? null,
    emergencyContact: {
      ...adaptEmergencyContact(ec),
      presentAddress: ec.present_address ?? profile.present_address ?? "-",
    },
    medicalConditions: CONDITION_FIELDS.filter((key) => history[key]),
    previousOperation: {
      date: formatDate(history.operation_date),
      procedure: history.operation_procedure ?? "-",
    },
  }
}
