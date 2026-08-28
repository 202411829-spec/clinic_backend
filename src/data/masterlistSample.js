// src/data/masterlistSample.js
// Placeholder data for the Masterlist page (/admin/masterlist).
// Swap `masterlistStudents` for a real Supabase query when ready — the
// panel only cares about this shape, so wiring real data is a drop-in swap.

// Department / course reference data mirrors the LIVE DB seed
// (migrations/2026-08-28_clean_seed.sql): the 6 official Gordon College
// colleges/institutes with full names, and the official program list with
// majors expanded into discrete course rows. The Course dropdown is
// department-dependent, so courseOptionsByDept is keyed by the full
// department name (same value the API returns as department_name, and the
// same name stored in the departments table).
const deptCoursePairs = [
  // CAHS
  { dept: "College of Allied Health Studies (CAHS)", course: "Bachelor of Science in Nursing (BSN)" },
  { dept: "College of Allied Health Studies (CAHS)", course: "Bachelor of Science in Midwifery (BSM)" },
  // CBA
  { dept: "College of Business and Accountancy (CBA)", course: "Bachelor of Science in Accountancy (BSA)" },
  { dept: "College of Business and Accountancy (CBA)", course: "BS Business Administration Major in Financial Management" },
  { dept: "College of Business and Accountancy (CBA)", course: "BS Business Administration Major in Human Resource Management" },
  { dept: "College of Business and Accountancy (CBA)", course: "BS Business Administration Major in Marketing Management" },
  { dept: "College of Business and Accountancy (CBA)", course: "Bachelor of Science in Customs Administration (BSCA)" },
  // CCS
  { dept: "College of Computer Studies (CCS)", course: "Bachelor of Science in Computer Science (BSCS)" },
  { dept: "College of Computer Studies (CCS)", course: "Bachelor of Science in Information Technology (BSIT)" },
  { dept: "College of Computer Studies (CCS)", course: "BS Entertainment and Multimedia Computing Major in Digital Animation Technology" },
  { dept: "College of Computer Studies (CCS)", course: "BS Entertainment and Multimedia Computing Major in Game Development" },
  { dept: "College of Computer Studies (CCS)", course: "Associate in Computer Technology (ACT)" },
  // CEAS
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Arts in Communication (BAComm)" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Culture and Arts Education (BCAEd)" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Early Childhood Education (BECEd)" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Elementary Education (BEEd)" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Physical Education (BPEd)" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Secondary Education Major in English" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Secondary Education Major in Filipino" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Secondary Education Major in Mathematics" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Secondary Education Major in Science" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Bachelor of Secondary Education Major in Social Studies" },
  { dept: "College of Education, Arts and Sciences (CEAS)", course: "Teacher Certificate Program (TCP)" },
  // CHTM
  { dept: "College of Hospitality and Tourism Management (CHTM)", course: "Bachelor of Science in Hospitality Management (BSHM)" },
  { dept: "College of Hospitality and Tourism Management (CHTM)", course: "Bachelor of Science in Tourism Management (BSTM)" },
  // IGS
  { dept: "Institute of Graduate Studies (IGS)", course: "Master of Arts in Nursing (MAN)" },
  { dept: "Institute of Graduate Studies (IGS)", course: "Master of Arts in Education Major in Educational Management (MAEd)" },
  { dept: "Institute of Graduate Studies (IGS)", course: "Master in Business Management (MBM)" },
  { dept: "Institute of Graduate Studies (IGS)", course: "Master in Public Administration / Management (MPA/MPM)" },
];

const people = [
  { first: "Joseph Daniel", middle: "B.", last: "Ramos", sex: "Male" },
  { first: "Mark Joshua", middle: "P.", last: "Alfonso", sex: "Male" },
  { first: "Christopher", middle: "T.", last: "Ladiero", sex: "Male" },
];

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const TOTAL_STUDENTS = 7000;

// Matches the mockup exactly: every row is the same placeholder student
// (Ramos, Joseph Daniel B. — CCS / BSCS, 3rd Year, Male,
// 02/05/2004, 09475429750), repeated for all 7,000 rows. Swap this for a
// real Supabase query later — the panel only cares about the shape below.
const placeholderPerson = people[0];
const placeholderDeptCourse = deptCoursePairs[7]; // CCS / BSCS
const placeholderYearLevel = "3rd Year";
const placeholderBirthday = "02/05/2004";
const placeholderContactNumber = "09475429750";
const placeholderStudentNumber = "202311330";
const placeholderCivilStatus = "Single";
const placeholderPresentAddress = "45B, Domingo St., Gordon Heights, Olongapo City";

// Used by the Medical Summary page (/admin/masterlist/:studentId/medical-summary).
// A real emergency contact — not the student themselves — swap for a real
// Supabase query later, same shape.
const placeholderEmergencyContact = {
  name: "Maria Elena B. Ramos",
  relationship: "Mother",
  contactNumber: "09171234567",
  presentAddress: placeholderPresentAddress,
};

const placeholderMedicalConditions = ["Allergy: Peanuts", "Hepatitis", "Asthma"];

const placeholderPreviousOperation = {
  date: "02/05/2004",
  procedure: "Exploratory Laparotomy",
};

export const masterlistStudents = Array.from({ length: TOTAL_STUDENTS }, (_, i) => ({
  id: `stu-${i + 1}`,
  studentNumber: placeholderStudentNumber,
  name: `${placeholderPerson.last}, ${placeholderPerson.first} ${placeholderPerson.middle}`,
  dept: placeholderDeptCourse.dept,
  course: placeholderDeptCourse.course,
  deptCourse: `${placeholderDeptCourse.dept} / ${placeholderDeptCourse.course}`,
  yearLevel: placeholderYearLevel,
  sex: placeholderPerson.sex,
  birthday: placeholderBirthday,
  contactNumber: placeholderContactNumber,
  civilStatus: placeholderCivilStatus,
  presentAddress: placeholderPresentAddress,
  emergencyContact: placeholderEmergencyContact,
  medicalConditions: placeholderMedicalConditions,
  previousOperation: placeholderPreviousOperation,
}));

// Used by the Student portal's own "Students Record" page (/student/record) —
// the student viewing their own info, not an admin looking someone up.
// TODO: replace with the logged-in student's own row from Supabase once
// student auth/session is wired up; matches the placeholder used for
// `currentUser` in StudentLayout so the name/course line up.
export const currentStudentRecord = masterlistStudents[0];

export const departmentOptions = Array.from(new Set(deptCoursePairs.map((d) => d.dept)));
export const courseOptions = Array.from(new Set(deptCoursePairs.map((d) => d.course)));
export const yearLevelOptions = yearLevels;

// Department -> list of courses under it, used by the Student Information
// edit form so the Course dropdown narrows down once a Department is picked.
// Keyed by full department name (matches department_name from the API).
export const courseOptionsByDept = deptCoursePairs.reduce((acc, { dept, course }) => {
  if (!acc[dept]) acc[dept] = [];
  acc[dept].push(course);
  return acc;
}, {});