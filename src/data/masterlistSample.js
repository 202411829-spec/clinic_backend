// src/data/masterlistSample.js
// Placeholder data for the Masterlist page (/admin/masterlist).
// Swap `masterlistStudents` for a real Supabase query when ready — the
// panel only cares about this shape, so wiring real data is a drop-in swap.

const deptCoursePairs = [
  { dept: "CCS", course: "BS in Computer Science" },
  { dept: "CCS", course: "BS in Information Technology" },
  { dept: "CCS", course: "BS in Entertainment and Multimedia Computing GAT" },
  { dept: "CCS", course: "BS in Entertainment and Multimedia Computing DAT" },
  { dept: "CAHS", course: "BS in Nursing" },
  { dept: "CAHS", course: "BS in Midwifery" },
  { dept: "CHTM", course: "BS in Tourism Management" },
  { dept: "CHTM", course: "BS in Hospitality Management" },
  { dept: "CBA", course: "BS in Accountancy" },
  { dept: "CBA", course: "BS in Business Administration Major in Financial Management" },
  { dept: "CBA", course: "BS in Business Administration Major in Human Resource Management" },
  { dept: "CBA", course: "BS in Business Administration Major in Marketing Management" },
  { dept: "CBA", course: "BS in Customs Administration" },
  { dept: "CEAS", course: "Bachelor of Arts in Communication" },
  { dept: "CEAS", course: "Bachelor of Early Childhood Education" },
  { dept: "CEAS", course: "Bachelor of Physical Education" },  
  { dept: "CEAS", course: "Bachelor of Elementary Education" },
  { dept: "CEAS", course: "Bachelor of Secondary Education Major in English" },
  { dept: "CEAS", course: "Bachelor of Secondary Education Major in Filipino" },
  { dept: "CEAS", course: "Bachelor of Secondary Education Major in Mathematics" },
  { dept: "CEAS", course: "Bachelor of Secondary Education Major in Science" },
  { dept: "CEAS", course: "Bachelor of Secondary Education Major in Social Studies" },   
];

const people = [
  { first: "Joseph Daniel", middle: "B.", last: "Ramos", sex: "Male" },
  { first: "Mark Joshua", middle: "P.", last: "Alfonso", sex: "Male" },
  { first: "Christopher", middle: "T.", last: "Ladiero", sex: "Male" },
];

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const TOTAL_STUDENTS = 7000;

// Matches the mockup exactly: every row is the same placeholder student
// (Ramos, Joseph Daniel B. — CCS / BS Computer Science, 3rd Year, Male,
// 02/05/2004, 09475429750), repeated for all 7,000 rows. Swap this for a
// real Supabase query later — the panel only cares about the shape below.
const placeholderPerson = people[0];
const placeholderDeptCourse = deptCoursePairs[0];
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
export const courseOptionsByDept = deptCoursePairs.reduce((acc, { dept, course }) => {
  if (!acc[dept]) acc[dept] = [];
  acc[dept].push(course);
  return acc;
}, {});
