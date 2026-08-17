// src/data/studentDashboardSample.js
// Placeholder data matching the shape of the Student Dashboard mockup.
// Swap for real Supabase queries when the student appointments API is ready —
// the panels only care about this shape, so wiring real data is a drop-in swap.

export const upcomingAppointment = {
  month: "AUG",
  day: "8",
  weekday: "MON",
  time: "8:00 AM - 9:00 AM",
  reason: "Medical Certificate",
  badge: "Today",
};

export const notifications = [
  {
    id: "n1",
    message: "You have successfully booked your appointment!",
    time: "Now",
  },
  {
    id: "n2",
    message: "Your appointment has been cancelled.",
    time: "4 hours ago",
  },
  {
    id: "n3",
    message: "Your appointment has been cancelled.",
    time: "4 hours ago",
  },
];
