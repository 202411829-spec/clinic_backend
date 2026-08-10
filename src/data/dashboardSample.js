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

export const statusOptions = ["Completed", "Pending", "No-show"];
