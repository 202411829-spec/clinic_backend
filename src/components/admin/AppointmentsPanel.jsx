// src/components/admin/AppointmentsPanel.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import NavIcon from "./NavIcon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import StatusMenu from "./StatusMenu.jsx";
import TimeBlockEditPopover from "./TimeBlockEditPopover.jsx";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { appointmentsApi } from "../../lib/api.js";
import { toYMD } from "../../lib/calendar.js";

function SlotActionMenu({ onEdit, onDelete, editing, slot, onCloseEdit, onSaveTimeBlock }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Slot actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="icon-btn w-7 h-7 rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800 leading-none text-lg"
      >
        <NavIcon name="dots" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-20 w-32 overflow-hidden rounded-card bg-white shadow-e3 origin-top-right animate-pop-in motion-reduce:animate-none"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
          >
            Edit
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-signal-rose hover:bg-signal-rose-bg"
          >
            Delete
          </button>
        </div>
      )}

      {editing && (
        <TimeBlockEditPopover
          slot={slot}
          onClose={onCloseEdit}
          onSave={onSaveTimeBlock}
        />
      )}
    </div>
  );
}

function SlotGroup({ slot, onStatusChange, editing, onToggleEdit, onSaveTimeBlock, onDeleteTimeBlock }) {
  const [expanded, setExpanded] = useState(slot.bookings.length > 0);

  return (
    // Each time block is a row within the shared panel now (no border/radius
    // of its own — see the panel wrapper below), so blocks read as one
    // continuous list rather than a stack of separate cards.
    <div className="border-b border-ink-100 last:border-b-0">
      <div className="relative w-full flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-5 py-3 text-left">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <span
            className={`shrink-0 text-ink-400 transition-transform duration-200 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <span className="tnum text-sm font-semibold text-ink-900 whitespace-nowrap">
            {slot.time}
          </span>
        </button>

        <div className="flex items-center gap-2 pl-6 md:pl-0 shrink-0">
          <span
            className={`tnum text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${
              slot.full
                ? "bg-signal-rose-bg text-signal-rose ring-signal-rose-ring"
                : "bg-brand-50 text-brand-800 ring-brand-200"
            }`}
          >
            {slot.booked} / {slot.capacity} booked
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              slot.full ? "text-signal-rose" : "text-ink-400"
            }`}
          >
            {slot.full
              ? "Full"
              : `${slot.slotsLeft} slot${slot.slotsLeft === 1 ? "" : "s"} left`}
          </span>

          <SlotActionMenu
            onEdit={() => onToggleEdit(slot.id)}
            onDelete={() => {
              if (window.confirm(`Delete the ${slot.time} time block?`)) {
                onDeleteTimeBlock(slot.id);
              }
            }}
            editing={editing}
            slot={slot}
            onCloseEdit={() => onToggleEdit(null)}
            onSaveTimeBlock={(data) => onSaveTimeBlock(slot.id, data)}
          />
        </div>
      </div>

      {/* Always mounted, height animated via grid-rows — this is what makes
          opening/closing a time block glide instead of snap, with zero JS
          height measurement. */}
      <div className={`expand ${expanded ? "is-open" : ""}`}>
        <div>
          {slot.bookings.length > 0 ? (
            <div className="overflow-x-auto border-t border-ink-100">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs font-medium text-ink-500">
                    <th className="py-2.5 pl-5 pr-3 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Age</th>
                    <th className="px-3 py-2.5 font-medium">Dept</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">Sex</th>
                    <th className="px-3 py-2.5 font-medium">Reason</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="py-2.5 pl-3 pr-5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="tbl-animate divide-y divide-ink-100">
                  {slot.bookings.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-ink-50/70">
                      <td className="py-3 pl-5 pr-3 font-medium text-ink-900">{b.name}</td>
                      <td className="tnum px-3 py-3 text-ink-600">{b.age}</td>
                      <td className="px-3 py-3 text-ink-600">{b.dept}</td>
                      <td className="px-3 py-3 text-ink-600 hidden md:table-cell">{b.sex}</td>
                      <td className="px-3 py-3 text-ink-600">{b.reason}</td>
                      <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <StatusMenu
                          current={b.status}
                          onChange={(newStatus) => onStatusChange(slot.id, b.id, newStatus)}
                          onViewRecord={() => alert(`Viewing record for ${b.name}`)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-ink-100 px-5 py-8 text-center text-sm text-ink-400">
              No bookings match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeAppointmentStatus(value) {
  if (!value) return "pending";
  const v = String(value).trim().toLowerCase();
  if (v === "no-show" || v === "no show" || v === "no_show") return "no_show";
  if (v === "canceled") return "cancelled";
  if (v === "pending" || v === "completed" || v === "cancelled" || v === "no_show") return v;
  return "pending";
}

// A hairline-divided rail rather than a dotted legend bar squeezed into one
// line — matches the StatRail used elsewhere, so "counts at a glance" always
// looks like the same object across the app.
function AppointmentsSummary({ counts }) {
  const items = [
    { label: "Total", value: counts.total, tone: "text-ink-900" },
    { label: "Pending", value: counts.pending, tone: "text-signal-amber" },
    { label: "Completed", value: counts.completed, tone: "text-brand-700" },
    { label: "No-show", value: counts.no_show, tone: "text-signal-rose" },
    { label: "Cancelled", value: counts.cancelled, tone: "text-ink-400" },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-ink-100 rounded-card bg-ink-50/60 mb-4 overflow-hidden">
      {items.map((item) => (
        <div key={item.label} className="px-3 py-2.5">
          <p className="text-2xs font-medium text-ink-500">{item.label}</p>
          <p className={`tnum text-base font-semibold ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function AppointmentsPanel({ reasonRecords = [] }) {
  const [slots, setSlots] = useState([]);
  const [dateLabel, setDateLabel] = useState("");
  const [openEditId, setOpenEditId] = useState(null);
  const [appointmentsForCounts, setAppointmentsForCounts] = useState([]);

  // Search and filter state
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Department");
  const [reasonFilter, setReasonFilter] = useState("All Reason");

  // Recent slots for the dashboard widget. Reasons are provided by the parent
  // Dashboard via props (fetched once, shared).
  useEffect(() => {
    appointmentsApi
      .slots(toYMD(new Date()))
      .then((res) => setSlots(res?.slots || []))
      .catch((err) => console.error("Failed to load slots:", err));
  }, []);

  // Fetch today's appointments for the summary tiles (includes all statuses).
  useEffect(() => {
    let cancelled = false;
    appointmentsApi
      .list({ date: toYMD(new Date()) })
      .then((res) => {
        if (!cancelled) setAppointmentsForCounts(res?.appointments || []);
      })
      .catch(() => {
        if (!cancelled) setAppointmentsForCounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive departments and reasons from loaded slots
  const departments = useMemo(() => {
    const set = new Set(slots.flatMap((s) => s.bookings.map((b) => b.dept)));
    return ["All Department", ...Array.from(set)];
  }, [slots]);

  const reasons = useMemo(() => {
    const set = new Set(slots.flatMap((s) => s.bookings.map((b) => b.reason)));
    return ["All Reason", ...Array.from(set)];
  }, [slots]);

  // Derive real reason records for the dropdown (with reason_id)
  const reasonRecordsForDropdown = useMemo(() => {
    return reasonRecords.map((r) => ({ value: r.reason_id, label: r.description }));
  }, [reasonRecords]);

  const filteredSlots = useMemo(() => {
    return slots.map((slot) => {
      const nonCancelled = slot.bookings.filter(
        (b) => String(b.status ?? "").toLowerCase() !== "cancelled"
      );
      const pendingCount = nonCancelled.length;
      const filteredBookings = nonCancelled.filter((b) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          b.name.toLowerCase().includes(q) ||
          b.dept.toLowerCase().includes(q);
        const matchesDept = department === "All Department" || b.dept === department;
        const matchesReason = reasonFilter === "All Reason" || b.reason === reasonFilter;
        return matchesSearch && matchesDept && matchesReason;
      });
      return {
        ...slot,
        bookings: filteredBookings,
        booked: pendingCount,
        slotsLeft: Math.max(slot.capacity - pendingCount, 0),
        full: pendingCount >= slot.capacity,
      };
    });
  }, [slots, search, department, reasonFilter]);

  const summaryCounts = useMemo(() => {
    const counts = { total: 0, pending: 0, completed: 0, no_show: 0, cancelled: 0 };
    for (const a of appointmentsForCounts) {
      const st = normalizeAppointmentStatus(a.current_status);
      counts.total += 1;
      if (st === "pending") counts.pending += 1;
      else if (st === "completed") counts.completed += 1;
      else if (st === "no_show") counts.no_show += 1;
      else if (st === "cancelled") counts.cancelled += 1;
    }
    return counts;
  }, [appointmentsForCounts]);

  const totalBookings = useMemo(
    () => filteredSlots.reduce((acc, s) => acc + s.bookings.length, 0),
    [filteredSlots]
  );
  const hasAppointments = totalBookings > 0;

  function handleStatusChange(slotId, bookingId, newStatus) {
    const normalized = normalizeAppointmentStatus(newStatus);
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id !== slotId
          ? slot
          : {
              ...slot,
              bookings: slot.bookings.map((b) =>
                b.id === bookingId ? { ...b, status: newStatus } : b
              ),
            }
      )
    );
    setAppointmentsForCounts((prev) =>
      prev.map((a) =>
        String(a.appointment_id) === String(bookingId) ? { ...a, current_status: normalized } : a
      )
    );
    appointmentsApi
      .updateStatus(bookingId, { new_status: newStatus })
      .catch((err) => console.error("Failed to save status:", err));
  }

  function handleSaveTimeBlock(slotId, data) {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const capacity = data.slots;
        const slotsLeft = Math.max(capacity - slot.booked, 0);
        return {
          ...slot,
          time: data.time,
          capacity,
          slotsLeft,
          full: slot.booked >= capacity,
        };
      })
    );
  }

  function handleDeleteTimeBlock(slotId) {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
    setOpenEditId((cur) => (cur === slotId ? null : cur));
  }

  return (
    <section className="overflow-hidden rounded-panel bg-white shadow-e2">
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Appointments</h2>
          <p className="text-xs text-ink-500">Today's appointment slots</p>
        </div>
        <span className="text-xs font-medium text-ink-500">{dateLabel || "Today"}</span>
      </div>

      <div className="px-5 pt-4">
        <AppointmentsSummary counts={summaryCounts} />

        {/* search + filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
          <div className="md:col-span-1 flex items-center gap-2 rounded-control border border-ink-200 bg-white px-3 py-2 text-sm text-ink-400 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15">
            <NavIcon name="user" className="w-4 h-4 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by surname, name, student ID, or course…"
              className="w-full outline-none placeholder:text-ink-400 text-ink-900"
            />
          </div>
          <UniversalDropdown value={department} onChange={setDepartment} options={departments} />
          <UniversalDropdown value="All Courses" onChange={() => {}} options={["All Courses"]} />
          <UniversalDropdown
            value={reasonFilter}
            onChange={setReasonFilter}
            options={[{ value: "All Reason", label: "All Reason" }, ...reasonRecordsForDropdown]}
          />
        </div>
      </div>

      {!hasAppointments ? (
        <div className="py-14 text-center text-sm">
          <p className="font-medium text-ink-900">No appointments today</p>
          <p className="mt-1 text-ink-500">New bookings for today will appear here as they come in.</p>
        </div>
      ) : (
        <div className="border-t border-ink-100">
          {filteredSlots.map((slot) => (
            <SlotGroup
              key={slot.id}
              slot={slot}
              onStatusChange={handleStatusChange}
              editing={openEditId === slot.id}
              onToggleEdit={(id) => setOpenEditId((cur) => (cur === id ? null : id))}
              onSaveTimeBlock={handleSaveTimeBlock}
              onDeleteTimeBlock={handleDeleteTimeBlock}
            />
          ))}
        </div>
      )}
    </section>
  );
}