// src/components/admin/LogbookPanel.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "./NavIcon.jsx";
import {
  recentLogbookEntries as sampleEntries,
  reasonOptions as sampleReasons,
} from "../../data/dashboardSample.js";
import { logbookApi, referenceApi } from "../../lib/api.js";

function mapEntry(r) {
  return {
    id: r.id ?? r.log_id,
    dateTime: r.dateTime || "-",
    name: r.name || "-",
    age: r.age ?? "-",
    deptCourse: r.deptCourse || "-",
    sex: r.sex || "-",
    reason: r.reason || "-",
    complaint: r.complaint || "-",
    medicine: r.medicine || "-",
  };
}

export default function LogbookPanel() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [reasons, setReasons] = useState(sampleReasons);

  // Recent visits for the dashboard widget + real reason dropdown.
  useEffect(() => {
    logbookApi
      .list()
      .then((res) => setEntries((res?.logbook || []).slice(0, 5).map(mapEntry)))
      .catch((err) => console.error("Failed to load logbook:", err));
    referenceApi
      .reasons()
      .then((res) => {
        const list = (res?.reasons || [])
          .map((r) => r.description)
          .filter((d) => d && d !== "-");
        if (list.length) setReasons(list);
      })
      .catch(() => {});
  }, []);

  // walk-in form visibility — hidden by default, opened by the
  // "+ Add Walk-in Visit" button, same pattern as the full Logbook page.
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  const [regId, setRegId] = useState("");
  const [reason, setReason] = useState("");
  const [complaint, setComplaint] = useState("");
  const [medicine, setMedicine] = useState("");
  const [quantity, setQuantity] = useState("");
  const [medTags, setMedTags] = useState([]);

  function handleAddMedicine() {
    if (!medicine.trim()) return;
    const qty = quantity ? `x${quantity}` : "";
    setMedTags((tags) => [...tags, `${medicine.trim()} ${qty}`.trim()]);
    setMedicine("");
    setQuantity("");
  }

  function resetWalkInForm() {
    setRegId("");
    setReason("");
    setComplaint("");
    setMedicine("");
    setQuantity("");
    setMedTags([]);
  }

  async function handleAddWalkIn() {
    if (!regId.trim()) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}:00`;

    try {
      await logbookApi.createWalkIn({
        student_id: regId.trim(),
        appointment_date: `${y}-${m}-${d}`,
        appointment_time: time,
        reason_id: reasons.indexOf(reason) >= 0 ? reasons.indexOf(reason) + 1 : undefined,
        complaint: complaint.trim() || undefined,
      });
      // Refresh the recent-visits list from the backend.
      const res = await logbookApi.list();
      setEntries((res?.logbook || []).slice(0, 5).map(mapEntry));
    } catch (err) {
      console.error("Walk-in failed:", err);
      alert(`Couldn't save the walk-in visit: ${err.message}`);
      return;
    }

    resetWalkInForm();
    setShowWalkInForm(false);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="book" className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-bold text-gray-800 text-sm md:text-base leading-tight">
              Logbook
            </h2>
            <p className="text-xs text-gray-400 leading-tight">
              View history of completed clinic visits.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/admin/logbook")}
          className="text-xs font-semibold text-gc-green flex items-center gap-1 hover:underline"
        >
          View Full Logbook <span aria-hidden>›</span>
        </button>
      </div>

      {/* search + filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <div className="md:col-span-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">
          <NavIcon name="user" className="w-4 h-4 shrink-0" />
          <input
            placeholder="Search by surname, name, student ID, or course..."
            className="w-full outline-none placeholder:text-gray-400"
          />
        </div>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
          <option>All Department</option>
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
          <option>All Courses</option>
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
          <option>All Reason</option>
        </select>
      </div>

      {/* table */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-sm min-w-[640px] border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50">
              <th className="py-2 px-4 md:px-2 font-semibold border border-gray-300">Date / Time</th>
              <th className="py-2 px-2 font-semibold border border-gray-300">Name</th>
              <th className="py-2 px-2 font-semibold border border-gray-300">Age</th>
              <th className="py-2 px-2 font-semibold border border-gray-300">Dept. &amp; Course</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 hidden md:table-cell">Sex</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 hidden md:table-cell">Reason</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 hidden md:table-cell">Complaint</th>
              <th className="py-2 px-2 font-semibold border border-gray-300 hidden md:table-cell">Medicine</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => (
              <tr key={row.id}>
                <td className="py-2.5 px-4 md:px-2 text-gray-700 border border-gray-300 whitespace-nowrap">
                  {row.dateTime}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{row.name}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{row.age}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{row.deptCourse}</td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 hidden md:table-cell">
                  {row.sex}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 hidden md:table-cell">
                  {row.reason}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 hidden md:table-cell">
                  {row.complaint}
                </td>
                <td className="py-2.5 px-2 text-gray-700 border border-gray-300 hidden md:table-cell">
                  {row.medicine}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* bottom trigger — hidden once the form is open */}
      {!showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300 flex items-center justify-end gap-2">
          <button
            onClick={() => setShowWalkInForm(true)}
            className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
          >
            + Add Walk-in Visit
          </button>
        </div>
      )}

      {/* walk-in visit form — expands directly below the button, closes back into it */}
      {showWalkInForm && (
        <div className="mt-4 pt-4 border-t-2 border-gray-300">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800">Add Walk-in Visit</h2>
            <button
              onClick={() => {
                setShowWalkInForm(false);
                resetWalkInForm();
              }}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <span aria-hidden className="text-base leading-none">×</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                ID / Registration Number
              </label>
              <input
                value={regId}
                onChange={(e) => setRegId(e.target.value)}
                placeholder="Student ID"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none focus:border-gc-accent"
              >
                <option value="">Select Reason</option>
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Complaint</label>
              <input
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="E.g. Headache"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-500">Medicine</label>
                <input
                  value={medicine}
                  onChange={(e) => setMedicine(e.target.value)}
                  placeholder="E.g. Paracetamol"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
                />
                {medTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {medTags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs font-medium bg-gc-accent/10 text-gc-accent px-3 py-1.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Quantity</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    type="number"
                    min="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gc-accent"
                  />
                  <button
                    onClick={handleAddMedicine}
                    className="shrink-0 text-xs font-semibold bg-gc-accent text-white px-3 py-2 rounded-lg hover:opacity-90 whitespace-nowrap"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <button
              onClick={() => {
                setShowWalkInForm(false);
                resetWalkInForm();
              }}
              className="text-sm font-semibold text-gray-600 border border-gray-200 px-4 py-2.5 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddWalkIn}
              className="text-sm font-semibold bg-gc-green text-white px-4 py-2.5 rounded-lg hover:opacity-90"
            >
              + Add Walk-in Visit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
