// src/pages/student/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import UpcomingAppointmentPanel from "../../components/student/UpcomingAppointmentPanel";
import NotificationsPanel from "../../components/student/NotificationsPanel";
import StudentHero from "../../components/student/StudentHero";
import VisitStats from "../../components/student/VisitStats";
import AppointmentHistoryTable from "../../components/student/AppointmentHistoryTable";
import { appointmentsApi, masterlistApi } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext";

export default function Dashboard() {
  const { studentId } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    masterlistApi
      .getStudent(studentId)
      .then((p) => !cancelled && setFirstName(p?.first_name ?? ""))
      .catch(() => {});
    appointmentsApi
      .list({ student_id: studentId })
      .then((res) => {
        if (cancelled) return;
        const mine = (res?.appointments || [])
          .filter((a) => String(a.student_id).toUpperCase().trim() === String(studentId).toUpperCase().trim())
          .sort((a, b) =>
            `${b.appointment_date} ${b.appointment_time}`.localeCompare(`${a.appointment_date} ${a.appointment_time}`)
          );
        setRows(mine);
      })
      .catch((err) => console.error("Failed to load appointment history:", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const counts = useMemo(() => {
    const by = (s) => rows.filter((a) => (a.current_status || "pending") === s).length;
    return {
      total: rows.length,
      completed: by("completed"),
      pending: by("pending"),
      missed: by("cancelled") + by("no_show"),
    };
  }, [rows]);

  return (
    <div className="stagger mx-auto max-w-5xl space-y-4 pb-6 pt-2 md:space-y-6 md:pb-10 md:pt-4">
      <StudentHero firstName={firstName} />
      <VisitStats counts={counts} />
      <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><UpcomingAppointmentPanel /></div>
        <div className="lg:col-span-2"><NotificationsPanel /></div>
      </div>
      <AppointmentHistoryTable rows={rows} loading={loading} />
    </div>
  );
}
