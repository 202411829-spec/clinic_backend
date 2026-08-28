// src/context/AppointmentContext.jsx
// Holds the student's single upcoming appointment in memory so the Book
// page, the Dashboard's "Upcoming Appointment" card, and the notifications
// panel all stay in sync as the student books/reschedules/cancels — without
// a page reload and without needing the backend yet.
//
// TODO: replace this in-memory store with real Supabase reads/writes
// (fetch the student's upcoming appointment on mount, insert/update/delete
// on book/reschedule/cancel). Every consumer only touches the functions
// below, so swapping the implementation here is a drop-in change.

import { createContext, useContext, useState, useCallback } from "react";
import { isSameDate, getCalendarBoxParts } from "../lib/calendar";

const AppointmentContext = createContext(null);

function buildAppointment({ id, date, time, reason }) {
  const { month, day, weekday } = getCalendarBoxParts(date);
  return {
    id,
    date,
    time,
    reason,
    month,
    day,
    weekday,
    badge: isSameDate(date, new Date()) ? "Today" : "Upcoming",
  };
}

export function AppointmentProvider({ children }) {
  const [appointment, setAppointment] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const pushNotification = useCallback((message) => {
    setNotifications((prev) => [
      { id: `n${Date.now()}`, message, time: "Now" },
      ...prev,
    ]);
  }, []);

  const bookAppointment = useCallback(
    ({ id, date, time, reason }) => {
      setAppointment(buildAppointment({ id, date, time, reason }));
      pushNotification("You have successfully booked your appointment!");
    },
    [pushNotification]
  );

  const rescheduleAppointment = useCallback(
    ({ id, date, time, reason }) => {
      setAppointment(buildAppointment({ id, date, time, reason }));
      pushNotification("Your appointment has been rescheduled.");
    },
    [pushNotification]
  );

  const cancelAppointment = useCallback(() => {
    setAppointment(null);
    pushNotification("Your appointment has been cancelled.");
  }, [pushNotification]);

  return (
    <AppointmentContext.Provider
      value={{
        appointment,
        notifications,
        bookAppointment,
        rescheduleAppointment,
        cancelAppointment,
      }}
    >
      {children}
    </AppointmentContext.Provider>
  );
}

export function useAppointment() {
  const ctx = useContext(AppointmentContext);
  if (!ctx) {
    throw new Error("useAppointment must be used inside <AppointmentProvider>");
  }
  return ctx;
}
