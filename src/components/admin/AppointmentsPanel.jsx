// src/components/admin/AppointmentsPanel.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NavIcon from "../ui/NavIcon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import StatusMenu from "./StatusMenu.jsx";
import TimeBlockEditPopover from "./TimeBlockEditPopover.jsx";
import FilterMultiSelect from "../ui/FilterMultiSelect.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import { appointmentsApi } from "../../lib/api.js";
import { toYMD } from "../../lib/calendar.js";
import { formatTimeRange } from "../../lib/timeFormat";
import {
  buildAppointmentCourseOptions,
  buildAppointmentDepartmentOptions,
  buildAppointmentReasonOptions,
  filterAppointmentSlots,
} from "../../lib/appointmentSlots.js";

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
        aria-label="Slot actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="icon-btn w-7 h-7 rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-800 leading-none text-lg"
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
          ariaLabel="Slot actions"
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

function SlotGroup({ slot, onStatusChange, onViewRecord, editing, onToggleEdit, onSaveTimeBlock, onDeleteTimeBlock }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-visible mb-2">
      {error && (
        <div role="alert" className="mx-2 mt-2 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between gap-2 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-semibold underline underline-offset-2" aria-label="Dismiss error">Dismiss</button>
        </div>
      )}
      <div className="relative w-full flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-4 py-3 bg-white text-left">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <span
            className={`shrink-0 transition-transform text-gray-400 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
            {formatTimeRange(slot.time)}
          </span>
        </button>

        <div className="flex items-center gap-2 pl-6 md:pl-0 shrink-0">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
              slot.full
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-700"
            }`}
          >
            {slot.booked} / {slot.capacity} Booked
          </span>
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              slot.full ? "text-red-500" : "text-gray-400"
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

      {/* Always mounted, height animated via grid-rows — this is what makes
          opening/closing a time block glide instead of snap, with zero JS
          height measurement. */}
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
                          onViewRecord={() => {
                            const studentId = String(b.student_id ?? "").trim();
                            if (!studentId) {
                              setError("This appointment has no student ID to open a record.");
                              return;
                            }
                            setError(null);
                            onViewRecord(studentId);
                          }}
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

export default function AppointmentsPanel({ reasonRecords = [] }) {
  const navigate = useNavigate();
  const [slots, setSlots] = useState([]);
  const [dateLabel, setDateLabel] = useState("");
  const [openEditId, setOpenEditId] = useState(null);

  // Search and filter state — categorical filters are OR sets; empty = All.
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState([]);
  const [course, setCourse] = useState([]);
  const [reasonFilter, setReasonFilter] = useState([]);

  // Recent slots for the dashboard widget. Reasons are provided by the parent
  // Dashboard via props (fetched once, shared). This is the single fetch for
  // today; visible appointment blocks are derived from these same bookings.
  useEffect(() => {
    appointmentsApi
      .slots(toYMD(new Date()))
      .then((res) => setSlots(res?.slots || []))
      .catch((err) => console.error("Failed to load slots:", err));
  }, []);

  // Derive every categorical option from the actual loaded bookings so the
  // selected values always match what filterAppointmentSlots compares.
  const departments = useMemo(() => buildAppointmentDepartmentOptions(slots), [slots]);
  const courses = useMemo(() => buildAppointmentCourseOptions(slots), [slots]);
  const reasons = useMemo(() => {
    // Include the shared /reasons list so dedicated reasons remain filterable
    // even before their first appointment appears in today's slots.
    const values = new Set(buildAppointmentReasonOptions(slots));
    (reasonRecords || []).forEach((reason) => {
      const description = String(reason?.description || "").trim();
      if (description) values.add(description);
    });
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [slots, reasonRecords]);

  const filteredSlots = useMemo(
    () => filterAppointmentSlots(slots, { search, department, course, reason: reasonFilter }),
    [slots, search, department, course, reasonFilter]
  );
  const hasAppointments = filteredSlots.length > 0;

  function handleStatusChange(slotId, bookingId, newStatus) {
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

  function handleViewRecord(studentId) {
    navigate(`/admin/masterlist/${encodeURIComponent(studentId)}`);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-bold text-gray-800 text-sm md:text-base leading-tight">
              Appointments
            </h2>
            <p className="text-xs text-gray-400 leading-tight">
              Today's appointment slots
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-gray-500">
          {dateLabel || "Today"}
        </span>
      </div>

      {/* search + filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <div className="md:col-span-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400">
          <NavIcon name="user" className="w-4 h-4 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by surname, name, student ID, or course..."
            className="w-full outline-none placeholder:text-gray-400"
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

      {!hasAppointments ? (
        <div className="py-12 text-center text-gray-500 text-sm">
          No appointments today.
        </div>
      ) : (
        filteredSlots.map((slot) => (
          <SlotGroup
            key={slot.id}
            slot={slot}
            onStatusChange={requestStatusChange}
            onViewRecord={handleViewRecord}
            editing={openEditId === slot.id}
            onToggleEdit={(id) => setOpenEditId((cur) => (cur === id ? null : id))}
            onSaveTimeBlock={handleSaveTimeBlock}
            onDeleteTimeBlock={handleDeleteTimeBlock}
          />
        ))
      )}
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