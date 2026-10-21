// src/components/student/AppointmentHistoryTable.jsx
// The student's own visit history. Uses the shared .tbl system, so long
// reasons wrap inside their cell instead of running past the card.
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon.jsx";
import StatusPill from "./StatusPill.jsx";

function fmtDate(v) {
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(v) {
  if (!v) return "—";
  const [h, m] = String(v).slice(0, 5).split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

export default function AppointmentHistoryTable({ rows, loading }) {
  const navigate = useNavigate();
  return (
    <section className="panel card-hover">
      <div className="panel-head">
        <div>
          <h2 className="panel-title font-serif">Appointment history</h2>
          <p className="panel-sub">Every clinic visit you've booked, newest first.</p>
        </div>
        <button onClick={() => navigate("/student/book")} className="btn-secondary btn-sm btn-press">
          <NavIcon name="plus" className="h-3.5 w-3.5" />
          New booking
        </button>
      </div>

      <div className="tbl-scroll max-h-[26rem] overflow-y-auto">
        <table className="tbl min-w-[560px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-[1] bg-ink-50">Date</th>
              <th className="sticky top-0 z-[1] bg-ink-50">Time</th>
              <th className="sticky top-0 z-[1] bg-ink-50">Reason</th>
              <th className="sticky top-0 z-[1] bg-ink-50">Status</th>
            </tr>
          </thead>
          <tbody className="tbl-animate">
            {loading && (
              <tr><td colSpan={4} className="py-12 text-center text-ink-400">Loading your visits…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <p className="text-sm text-ink-500">No visits yet.</p>
                  <button onClick={() => navigate("/student/book")} className="mt-3 btn-primary btn-sm btn-press">
                    Book your first appointment
                  </button>
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.appointment_id} className="row-hover">
                <td className="whitespace-nowrap font-medium text-ink-900">{fmtDate(a.appointment_date)}</td>
                <td className="tnum whitespace-nowrap">{fmtTime(a.appointment_time)}</td>
                <td className="cell-wrap min-w-[180px]">{a.appointment_purpose || "—"}</td>
                <td><StatusPill status={a.current_status || "pending"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
