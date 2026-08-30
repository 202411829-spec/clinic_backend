// src/data/studentNav.js
// Single source of truth for the student portal sidebar links.
// Mirrors data/adminNav.js so the same NavIcon set can be reused.

export const studentMainNav = [
  { label: "Dashboard", to: "/student/dashboard", icon: "grid" },
  { label: "Book", to: "/student/book", icon: "calendar" },
  { label: "Profile", to: "/student/profile", icon: "user" },
];
