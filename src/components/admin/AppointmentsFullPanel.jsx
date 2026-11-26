// src/components/admin/AppointmentsFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon";
import StatusBadge from "./StatusBadge";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import StatusMenu from "./StatusMenu";
import TimeBlockEditPopover from "./TimeBlockEditPopover";
import FilterMultiSelect from "../ui/FilterMultiSelect.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import AppointmentDatePicker from "./AppointmentDatePicker.jsx";
import { appointmentsApi } from "../../lib/api.js";
import { filterAppointmentSlots } from "../../lib/appointmentSlots.js";
import {
  deriveRecordFilterOptions,
  reconcileRecordFilterSelections,
} from "../../lib/filterMultiSelect.js";
import { toYMD } from "../../lib/calendar";
import { formatTimeRange } from "../../lib/timeFormat";

function SlotActionMenu({ onEdit, onDelete, editing, slot, onCloseEdit, onSaveTimeBlock }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="icon-btn w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Time block actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <NavIcon name="dots" />
      </button>

      {open && (
        <PortalOverlay
          triggerRef={buttonRef}
          enabled={open}
          align="right"
          preferredWidth={128}
          estimatedHeight={112}
          role="menu"
          ariaLabel="Time block actions"
          className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
          onOutside={() => setOpen(false)}
          onEscape={() => setOpen(false)}
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
        </PortalOverlay>
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
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-visible mb-3">
      {error && (
        <div role="alert" className="mx-2 mt-2 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between gap-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}
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
            {formatTimeRange(slot.time)}
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
              if (window.confirm(`Delete the ${formatTimeRange(slot.time)} time block?`)) {
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

      {/* Always mounted, height animated via grid-rows (see .expand in
          index.css) — this makes opening/closing a time block glide instead
          of the content just popping in and out with no transition. */}
      <div className={`expand ${expanded ? "is-open" : ""}`}>
        <div>
          {slot.bookings.length > 0 ? (
            <div className="tbl-scroll border-t border-ink-100">
              <table className="tbl min-w-[560px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Dept</th>
                    <th className="hidden md:table-cell">Sex</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="tbl-animate">
                  {slot.bookings.map((b) => (
                    <tr key={b.id} className="row-hover">
                      <td className="cell-wrap min-w-[140px] font-medium text-ink-900">{b.name}</td>
                      <td className="tnum whitespace-nowrap">{b.age}</td>
                      <td className="cell-wrap min-w-[80px]">{b.dept}</td>
                      <td className="hidden whitespace-nowrap md:table-cell">{b.sex}</td>
                      <td className="cell-wrap min-w-[140px]">{b.reason}</td>
                      <td className="whitespace-nowrap">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="text-right">
                        <StatusMenu
                          current={b.status}
                          onChange={(newStatus) =>
                            onStatusChange(slot.id, b.id, newStatus)
                          }
                          onViewRecord={() => handleViewRecord(b.student_id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
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

export default function AppointmentsFullPanel({ selectedDate, onSelectDate }) {
  const navigate = useNavigate();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openEditId, setOpenEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState([]);
  const [course, setCourse] = useState([]);
  const [reasonFilter, setReasonFilter] = useState([]);

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

  // Derive categorical options from the bookings this screen can render.
  const bookings = useMemo(
    () => (Array.isArray(slots) ? slots : []).flatMap((slot) => slot?.bookings || []),
    [slots]
  );
  const filterFields = useMemo(
    () => ({
      department: (booking) => booking?.dept,
      course: (booking) => booking?.course,
      reason: (booking) => booking?.reason,
    }),
    []
  );
  const filterSelections = useMemo(
    () => ({ department, course, reason: reasonFilter }),
    [department, course, reasonFilter]
  );
  const options = useMemo(
    () =>
      deriveRecordFilterOptions({
        records: bookings,
        fields: filterFields,
        selections: filterSelections,
        matches: (booking) => {
          if (String(booking?.status ?? "").trim().toLowerCase() === "cancelled") return false;
          const query = search.trim().toLowerCase();
          if (!query) return true;
          // Keep the same searchable fields as filterAppointmentSlots.
          return [booking?.name, booking?.dept].some((value) =>
            String(value ?? "").toLowerCase().includes(query)
          );
        },
      }),
    [bookings, filterFields, filterSelections, search]
  );
  const { departments, courses, reasons } = options;

  useEffect(() => {
    const { next, changed } = reconcileRecordFilterSelections({
      selections: filterSelections,
      options,
    });
    if (!changed) return;
    if (next.department !== department) setDepartment(next.department);
    if (next.course !== course) setCourse(next.course);
    if (next.reason !== reasonFilter) setReasonFilter(next.reason);
  }, [options, filterSelections, department, course, reasonFilter]);

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

  function handleViewRecord(studentId) {
    const normalized = String(studentId ?? "").trim();
    if (!normalized) {
      setError("This appointment has no student ID to open a record.");
      return;
    }
    setError(null);
    navigate(`/admin/masterlist/${encodeURIComponent(normalized)}`);
  }

  // Cancelling is hard to undo, so ask first. Every other status applies at once.
  const [cancelTarget, setCancelTarget] = useState(null);

  function requestStatusChange(slotId, bookingId, newStatus) {
    if (/^cancel/i.test(String(newStatus))) {
      const booking = slots
        .find((s) => s.id === slotId)
        ?.bookings.find((b) => b.id === bookingId);
      if (/^cancel/i.test(String(booking?.status ?? ""))) return; // already cancelled
      setCancelTarget({ slotId, bookingId, name: booking?.name });
      return;
    }
    handleStatusChange(slotId, bookingId, newStatus);
  }

  function confirmCancel() {
    if (cancelTarget) handleStatusChange(cancelTarget.slotId, cancelTarget.bookingId, "Cancelled");
    setCancelTarget(null);
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

  const filteredSlots = useMemo(
    () =>
      filterAppointmentSlots(slots, {
        search,
        department,
        course,
        reason: reasonFilter,
      }),
    [slots, search, department, course, reasonFilter]
  );

  const hasAppointments = filteredSlots.length > 0;

  // A new date/search/category view starts every block collapsed. Other
  // updates (status changes, saving a time block, editing) keep the same keys
  // so the user's open/closed choices survive unrelated refreshes.
  const expansionViewKey = JSON.stringify({
    date: toYMD(selectedDate),
    search,
    department,
    course,
    reason: reasonFilter,
  });

  return (
    <section className="card-hover bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <h2 className="font-bold text-gc-green text-sm md:text-base">
            Appointments
          </h2>
        </div>
        <AppointmentDatePicker selectedDate={selectedDate} onSelectDate={onSelectDate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
        <div className="md:col-span-2 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus-within:ring-2 focus-within:ring-gc-accent/40 focus-within:border-gc-accent">
          <NavIcon name="search" className="w-4 h-4 shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by surname, name, student ID, or course..."
            className="w-full outline-none placeholder:text-gray-400 text-gray-700"
          />
        </div>
        <FilterMultiSelect
          value={department}
          onChange={setDepartment}
          options={departments}
          allLabel="All Department"
          pluralLabel="Departments"
          ariaLabel="Filter by department"
          triggerTestId="appointments-department-filter"
        />
        <FilterMultiSelect
          value={course}
          onChange={setCourse}
          options={courses}
          allLabel="All Courses"
          pluralLabel="Courses"
          ariaLabel="Filter by course"
          triggerTestId="appointments-course-filter"
        />
        <FilterMultiSelect
          value={reasonFilter}
          onChange={setReasonFilter}
          options={reasons}
          allLabel="All Reason"
          pluralLabel="Reasons"
          ariaLabel="Filter by reason"
          triggerTestId="appointments-reason-filter"
        />
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-gray-400">Loading appointments…</div>
      )}
      {!loading && error && (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      )}
      {!loading && !error && !hasAppointments && (
        <div className="py-12 text-center text-gray-500 text-sm">
          No appointments today.
        </div>
      )}

      {!loading && !error && hasAppointments &&
        filteredSlots.map((slot) => (
          <SlotGroup
            key={`${slot.id}:${expansionViewKey}`}
            slot={slot}
            onStatusChange={requestStatusChange}
            editing={openEditId === slot.id}
            onToggleEdit={(id) =>
              setOpenEditId((cur) => (cur === id ? null : id))
            }
            onSaveTimeBlock={handleSaveTimeBlock}
            onDeleteTimeBlock={handleDeleteTimeBlock}
          />
        ))}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this appointment?"
        message={
          cancelTarget?.name
            ? `${cancelTarget.name}'s appointment will be marked as Cancelled.`
            : "This appointment will be marked as Cancelled."
        }
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </section>
  );
}