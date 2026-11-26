// src/pages/admin/Appointments.jsx
import { useState } from "react";
import AppointmentsFullPanel from "../../components/admin/AppointmentsFullPanel";

export default function Appointments() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  return (
    <div className="pt-2">
      <AppointmentsFullPanel
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </div>
  );
}
