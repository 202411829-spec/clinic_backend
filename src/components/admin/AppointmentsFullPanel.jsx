// src/components/admin/AppointmentsFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import StatusBadge from "./StatusBadge";
import StatusMenu from "./StatusMenu";
import TimeBlockEditPopover from "./TimeBlockEditPopover";
import UniversalDropdown from "../ui/UniversalDropdown.jsx";
import { appointmentsApi, referenceApi } from "../../lib/api.js";
import { formatLongDate } from "../../lib/calendar";

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Time block actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        &#8942;
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-32 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
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
    <div className="border border-gray-200 rounded-2xl overflow-visible mb-3">
      <div className="relative w-full flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-4 py-3 bg-white">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <span
            className={`shrink-0 transition-transform text-gray-500 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
            {slot.time}
          </span>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
              slot.full
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-700"
            }`}
          >
            {slot.booked} / {slot.capacity} Booked
          </span>
        </button>

        <div className="flex items-center gap-3 pl-6 md:pl-0 shrink-0">
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              slot.full ? "text-red-500" : "text-gray-500"
            }`}
          >
            {slot.full
              ? "Full"
              : `${slot.slotsLeft} Slot${slot.slotsLeft === 1 ? "" : "s"} Left`}
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

      {expanded && slot.bookings.length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm min-w-[560px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50">
                <th className="py-2 px-4 font-semibold border border-gray-300">Name</th>
                <th className="py-2 px-2 font-semibold border border-gray-300">Age</th>
                <th className="py-2 px-2 font-semibold border border-gray-300">Dept</th>
                <th className="py-2 px-2 font-semibold border border-gray-300 hidden md:table-cell">
                  Sex
                </th>
                <th className="py-2 px-2 font-semibold border border-gray-300">Reason</th>
                <th className="py-2 px-2 font-semibold border border-gray-300">Status</th>
                <th className="py-2 px-4 font-semibold text-right border border-gray-300">Action</th>
              </tr>
            </thead>
            <tbody>
              {slot.bookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 px-4 text-gray-800 border border-gray-300">{b.name}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{b.age}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{b.dept}</td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300 hidden md:table-cell">
                    {b.sex}
                  </td>
                  <td className="py-2.5 px-2 text-gray-700 border border-gray-300">{b.reason}</td>
                  <td className="py-2.5 px-2 border border-gray-300">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="py-2.5 px-4 text-right border border-gray-300">
                    <StatusMenu
                      current={b.status}
                      onChange={(newStatus) =>
                        onStatusChange(slot.id, b.id, newStatus)
                      }
                      onViewRecord={() => alert(`Viewing record for ${b.name}`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && slot.bookings.length === 0 && (
        <div className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
          No bookings match the current filters.
        </div>
      )}
    </div>
  );
}

export default function AppointmentsFullPanel({ selectedDate }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openEditId, setOpenEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Department");
  const [reasonFilter, setReasonFilter] = useState("All Reason");
  const [reasonRecords, setReasonRecords] = useState([]);

  // Fetch real time slots + bookings for the selected date.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    appointmentsApi
      .slots(toYMD(selectedDate))
      .then((res) => {
        if (!cancelled) setSlots(res?.slots || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setError(err.message || "Failed to load appointments");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Fetch real reasons for the filter dropdown
  useEffect(() => {
    referenceApi
      .reasons()
      .then((res) => {
        const list = (res?.reasons || [])
          .filter((r) => r.description && r.description !== "-")
          .sort((a, b) => a.description.localeCompare(b.description));
        if (list.length) setReasonRecords(list);
      })
      .catch(() => {});
  }, []);

  // Derive departments from the loaded slots/bookings
  const departments = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => s.bookings.forEach((b) => set.add(b.dept)));
    return ["All Department", ...Array.from(set)];
  }, [slots]);

  function handleStatusChange(slotId, bookingId, newStatus) {
    // Optimistic update, persisted via PATCH /appointments/<id>/status.
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

  const filteredSlots = useMemo(() => {
    if (!search && department === "All Department" && reasonFilter === "All Reason") {
      return slots;
    }
    return slots.map((slot) => ({
      ...slot,
      bookings: slot.bookings.filter((b) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          b.name.toLowerCase().includes(q) ||
          b.dept.toLowerCase().includes(q);
        const matchesDept =
          department === "All Department" || b.dept === department;
        const matchesReason = reasonFilter === "All Reason" || b.reason === reasonFilter;
        return matchesSearch && matchesDept && matchesReason;
      }),
    }));
  }, [slots, search, department, reasonFilter]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <h2 className="font-bold text-gc-green text-sm md:text-base">
            Appointments
          </h2>
        </div>
        <span className="text-xs font-semibold text-gray-500">
          {formatLongDate(selectedDate)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <div className="md:col-span-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus-within:ring-2 focus-within:ring-gc-accent/40 focus-within:border-gc-accent">
          <NavIcon name="search" className="w-4 h-4 shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by surname, name, student ID, or course..."
            className="w-full outline-none placeholder:text-gray-400 text-gray-700"
          />
        </div>
        <UniversalDropdown value={department} onChange={setDepartment} options={departments} />
        <UniversalDropdown
          value={reasonFilter}
          onChange={setReasonFilter}
          options={[{ value: "All Reason", label: "All Reason" }, ...reasonRecords.map((r) => ({ value: r.description, label: r.description }))]}
        />
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-gray-400">Loading appointments…</div>
      )}
      {!loading && error && (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      )}
      {!loading && !error && filteredSlots.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">
          No time blocks for this date.
        </div>
      )}

      {filteredSlots.map((slot) => (
        <SlotGroup
          key={slot.id}
          slot={slot}
          onStatusChange={handleStatusChange}
          editing={openEditId === slot.id}
          onToggleEdit={(id) =>
            setOpenEditId((cur) => (cur === id ? null : id))
          }
          onSaveTimeBlock={handleSaveTimeBlock}
          onDeleteTimeBlock={handleDeleteTimeBlock}
        />
      ))}
    </section>
  );
}