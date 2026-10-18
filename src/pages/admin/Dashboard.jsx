// src/pages/admin/Dashboard.jsx
import { useEffect, useState } from "react";
import LogbookPanel from "../../components/admin/LogbookPanel.jsx";
import AppointmentsPanel from "../../components/admin/AppointmentsPanel.jsx";
import { referenceApi } from "../../lib/api.js";
import Reveal from "../../components/ui/Reveal.jsx";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const todayLabel = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

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
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            {todayLabel}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900">
            {greeting()}
          </h1>
          <p className="mt-1 text-base text-ink-500">Overview of today's clinic activity.</p>
        </div>
      </header>

      <Reveal delay={0}>
        <LogbookPanel
          reasonRecords={reasonRecords}
          medicineRecords={medicineRecords}
        />
      </Reveal>
      <Reveal delay={90}>
        <AppointmentsPanel reasonRecords={reasonRecords} />
      </Reveal>
    </div>
  );
}
