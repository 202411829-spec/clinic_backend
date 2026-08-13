// src/data/adminNav.js
// Single source of truth for the admin sidebar links.
// Keeping this separate makes it easy to reuse the same nav
// in the desktop sidebar and the mobile overlay sidebar.

export const mainNav = [
  { label: "Dashboard", to: "/admin/dashboard", icon: "grid" },
  { label: "Appointments", to: "/admin/appointments", icon: "calendar" },
  { label: "Logbook", to: "/admin/logbook", icon: "book" },
  { label: "Masterlist", to: "/admin/masterlist", icon: "user" },
];

export const managementNav = [
  { label: "Clinic Schedule", to: "/admin/clinic-schedule", icon: "clock" },
  { label: "Reports", to: "/admin/reports", icon: "chart" },
];
