// src/data/masterlistSample.js
// Reference data for the Department / Course dropdowns.

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

export const departmentOptions = Array.from(new Set(deptCoursePairs.map((d) => d.dept)));

// Department -> list of courses under it, used by the Student Information
// edit form so the Course dropdown narrows down once a Department is picked.
// Keyed by full department name (matches department_name from the API).
export const courseOptionsByDept = deptCoursePairs.reduce((acc, { dept, course }) => {
  if (!acc[dept]) acc[dept] = [];
  acc[dept].push(course);
  return acc;
}, {});
