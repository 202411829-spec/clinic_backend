// src/data/masterlistSample.js
// Placeholder data for the Masterlist page (/admin/masterlist).
// Swap `masterlistStudents` for a real Supabase query when ready — the
// panel only cares about this shape, so wiring real data is a drop-in swap.

const deptCoursePairs = [
  { dept: "CCS", course: "BS Computer Science" },
  { dept: "CCS", course: "BS Information Technology" },
  { dept: "CAHS", course: "BS Nursing" },
  { dept: "CHTM", course: "BS Tourism Management" },
  { dept: "CHTM", course: "BS Hospitality Management" },
  { dept: "CBA", course: "BS Accountancy" },
  { dept: "CBA", course: "BS Business Administration" },
  { dept: "CTE", course: "BSED English" },
  { dept: "CTE", course: "BEED" },
  { dept: "CEA", course: "BS Civil Engineering" },
];

const people = [
  { first: "Joseph Daniel", middle: "B.", last: "Ramos", sex: "Male" },
  { first: "Mark Joshua", middle: "P.", last: "Alfonso", sex: "Male" },
  { first: "Christopher", middle: "T.", last: "Ladiero", sex: "Male" },
  { first: "Maria Clara", middle: "D.", last: "Santos", sex: "Female" },
  { first: "Anna Rosario", middle: "M.", last: "Dela Cruz", sex: "Female" },
  { first: "John Michael", middle: "R.", last: "Reyes", sex: "Male" },
  { first: "Kristine Joy", middle: "A.", last: "Bautista", sex: "Female" },
  { first: "Angelo", middle: "S.", last: "Manalo", sex: "Male" },
  { first: "Bea Andrea", middle: "L.", last: "Villanueva", sex: "Female" },
  { first: "Paolo", middle: "G.", last: "Fernandez", sex: "Male" },
  { first: "Samantha", middle: "C.", last: "Ocampo", sex: "Female" },
  { first: "Rafael", middle: "N.", last: "Torres", sex: "Male" },
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
}));

export const departmentOptions = Array.from(new Set(deptCoursePairs.map((d) => d.dept)));
export const courseOptions = Array.from(new Set(deptCoursePairs.map((d) => d.course)));
export const yearLevelOptions = yearLevels;
