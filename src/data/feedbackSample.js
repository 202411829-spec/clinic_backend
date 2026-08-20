// src/data/feedbackSample.js
// Placeholder data for the Feedback pages (/student/feedback, /admin/feedback).
// Swap for a real Supabase table (e.g. `feedback`) when ready — both pages
// only care about this shape, so wiring real data is a drop-in swap.

export const feedbackCategories = [
  "Consultation",
  "Nurse / Staff",
  "Appointment Booking",
  "Clinic Facility",
  "Medical Certificate",
  "Other",
];

export const feedbackSample = [
  {
    id: "fb-1001",
    student: "Joseph Daniel B. Ramos",
    studentId: "21-00456",
    course: "BS Computer Science",
    rating: 5,
    category: "Consultation",
    message:
      "Mabilis at maayos ang pag-check up sa akin. Very accommodating po yung nurse and the doctor explained everything clearly.",
    date: "2026-08-18T09:24:00",
  },
  {
    id: "fb-1002",
    student: "Angela M. Cruz",
    studentId: "22-01123",
    course: "BS Nursing",
    rating: 4,
    category: "Appointment Booking",
    message:
      "Madali lang gamitin yung booking system, pero medyo matagal bago na-confirm yung slot ko. Overall okay naman.",
    date: "2026-08-17T14:02:00",
  },
  {
    id: "fb-1003",
    student: "Miguel A. Santos",
    studentId: "20-00789",
    course: "BS Information Technology",
    rating: 3,
    category: "Clinic Facility",
    message:
      "The waiting area could use more seats during peak hours, but the clinic itself is clean and well-organized.",
    date: "2026-08-15T11:47:00",
  },
  {
    id: "fb-1004",
    student: "Bea Faith L. Dela Cruz",
    studentId: "23-00214",
    course: "BS Tourism Management",
    rating: 5,
    category: "Nurse / Staff",
    message:
      "Super bait ng staff! Sobrang comfortable ako habang nag-cocheck up. Thank you po sa patience niyo.",
    date: "2026-08-14T08:15:00",
  },
  {
    id: "fb-1005",
    student: "Karl Justin P. Reyes",
    studentId: "21-01890",
    course: "BS Accountancy",
    rating: 2,
    category: "Medical Certificate",
    message:
      "Sana mapabilis pa yung processing ng medical certificate, kasi kailangan ko na agad siya for a school requirement.",
    date: "2026-08-12T16:30:00",
  },
];
