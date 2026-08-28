// src/pages/admin/Dashboard.jsx
import { useEffect, useState } from "react";
import LogbookPanel from "../../components/admin/LogbookPanel";
import AppointmentsPanel from "../../components/admin/AppointmentsPanel";
import { referenceApi } from "../../lib/api.js";

export default function Dashboard() {
  const [reasonRecords, setReasonRecords] = useState([]);
  const [medicineRecords, setMedicineRecords] = useState([]);

  // Shared reference data for the Dashboard panels — fetched once here and
  // passed down as props so LogbookPanel and AppointmentsPanel don't each
  // re-fetch the same reference lists.
  useEffect(() => {
    Promise.all([referenceApi.reasons(), referenceApi.medicines()])
      .then(([reasonsRes, medicinesRes]) => {
        const reasonsList = (reasonsRes?.reasons || []).filter(
          (r) => r.description && r.description !== "-"
        );
        if (reasonsList.length) setReasonRecords(reasonsList);
        const medsList = (medicinesRes?.medicines || []).filter(
          (m) => m.medicine_name
        );
        if (medsList.length) setMedicineRecords(medsList);
      })
      .catch((err) =>
        console.error("Failed to load reference data:", err)
      );
  }, []);

  return (
    <div className="pt-2 md:pt-1 space-y-3 md:space-y-3">
      <div>
        <h1 className="text-xl md:text-lg font-bold text-gc-green">Dashboard</h1>
        <p className="text-xs md:text-xs text-gray-500">
          Overview of today's clinic activity.
        </p>
      </div>

      <LogbookPanel
        reasonRecords={reasonRecords}
        medicineRecords={medicineRecords}
      />
      <AppointmentsPanel reasonRecords={reasonRecords} />
    </div>
  );
}
