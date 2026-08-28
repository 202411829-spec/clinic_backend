// src/data/dashboardSample.js
// Placeholder data matching the shape of your mockups.
// Swap these for real Supabase queries when ready — the panels
// only care about this shape, so wiring real data is a drop-in swap.

export const recentLogbookEntries = [
  {
    id: "lb1",
    dateTime: "06/07/2026 10:00 AM",
    name: "Ramos, Joseph Daniel B.",
    age: 22,
    deptCourse: "CCS / BS Computer Science",
    sex: "Male",
    reason: "Medical Certificate",
    complaint: "-",
    medicine: "-",
  },
  {
    id: "lb2",
    dateTime: "06/07/2026 10:00 AM",
    name: "Ramos, Joseph Daniel B.",
    age: 22,
    deptCourse: "CCS / BS Computer Science",
    sex: "Male",
    reason: "Consultation",
    complaint: "Headache",
    medicine: "Paracetamol x2",
  },
  {
    id: "lb3",
    dateTime: "06/07/2026 10:00 AM",
    name: "Ramos, Joseph Daniel B.",
    age: 22,
    deptCourse: "CCS / BS Computer Science",
    sex: "Male",
    reason: "Medical Certificate",
    complaint: "-",
    medicine: "-",
  },
];

// Fuller dataset for the standalone Logbook page (/admin/logbook), which
// needs enough rows to demonstrate search, filtering, and pagination.
// Same shape as recentLogbookEntries, plus split dept/course fields so
// the department & course filters on that page have something to key off.
const logbookPattern = [
  {
    reason: "Medical Certificate",
    complaint: "-",
    medicine: "-",
  },
  {
    reason: "Consultation",
    complaint: "Headache",
    medicine: "Paracetamol x2",
  },
];

const logbookPeople = [
  { name: "Ramos, Joseph Daniel B.", age: 22, dept: "CCS", course: "BS Computer Science", sex: "Male" },
  { name: "Alfonso, Mark Joshua", age: 21, dept: "CAHS", course: "BS Nursing", sex: "Male" },
  { name: "Ladiero, Christopher", age: 23, dept: "CHTM", course: "BS Tourism Management", sex: "Male" },
  { name: "Santos, Maria Clara D.", age: 20, dept: "CBA", course: "BS Accountancy", sex: "Female" },
  { name: "Dela Cruz, Anna Rosario", age: 22, dept: "CCS", course: "BS Information Technology", sex: "Female" },
  { name: "Reyes, John Michael", age: 19, dept: "CTE", course: "BSED English", sex: "Male" },
];

export const logbookEntries = Array.from({ length: 14 }, (_, i) => {
  const person = logbookPeople[0];
  const pattern = logbookPattern[i % logbookPattern.length];
  return {
    id: `lb-${i + 1}`,
    dateTime: "06/07/2026 10:00 AM",
    studentId: "20241000",
    name: person.name,
    age: person.age,
    dept: person.dept,
    course: person.course,
    deptCourse: `${person.dept} / ${person.course}`,
    sex: person.sex,
    reason: pattern.reason,
    complaint: pattern.complaint,
    medicine: pattern.medicine,
  };
});

export const appointmentDate = "August 6, 2026";

export const appointmentSlots = [
  {
    id: "slot1",
    time: "8:00 AM - 9:00 AM",
    capacity: 10,
    booked: 3,
    slotsLeft: 7,
    full: false,
    bookings: [
      {
        id: "b1",
        name: "Joseph Daniel B. Ramos",
        age: 22,
        dept: "CCS",
        sex: "M",
        reason: "Medical Certificate",
        status: "Completed",
      },
      {
        id: "b2",
        name: "Mark Joshua Alfonso",
        age: 22,
        dept: "CAHS",
        sex: "M",
        reason: "Medical Certificate",
        status: "Pending",
      },
      {
        id: "b3",
        name: "Christopher Ladiero",
        age: 22,
        dept: "CHTM",
        sex: "M",
        reason: "Medical Certificate",
        status: "No-show",
      },
    ],
  },
  {
    id: "slot2",
    time: "9:00 AM - 10:00 AM",
    capacity: 10,
    booked: 9,
    slotsLeft: 1,
    full: false,
    bookings: [],
  },
  {
    id: "slot3",
    time: "9:00 AM - 10:00 AM",
    capacity: 10,
    booked: 10,
    slotsLeft: 0,
    full: true,
    bookings: [],
  },
];

export const reasonOptions = [
  "Medical Certificate",
  "Consultation",
  "Follow-up",
  "Vaccination",
  "Other",
];

export const statusOptions = ["Completed", "Pending", "No-show", "Cancelled"];
