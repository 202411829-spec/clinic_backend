// src/pages/admin/Appointments.jsx
import { useState } from "react";
import AppointmentsFullPanel from "../../components/admin/AppointmentsFullPanel";
import SelectDateCalendar from "../../components/admin/SelectDateCalendar";

export default function Appointments() {
  // Defaults to the date used in the sample data (Aug 6, 2026) so the
  // page matches the mockup out of the box. Swap for `new Date()` once
  // appointmentSlots is wired to real, date-scoped Supabase data.
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 7, 6));

  return (
    <div className="pt-2">
      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="order-2 lg:order-1 flex-1 min-w-0">
          <AppointmentsFullPanel selectedDate={selectedDate} />
        </div>
        <div className="order-1 lg:order-2 w-full lg:w-[300px] shrink-0">
          <SelectDateCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>
      </div>
    </div>
  );
}
