// src/components/admin/AppointmentsPanel.jsx
import { useState } from "react";
import NavIcon from "./NavIcon";
import StatusBadge from "./StatusBadge";
import StatusMenu from "./StatusMenu";
import TimeBlockEditPopover from "./TimeBlockEditPopover";
import { appointmentSlots, appointmentDate } from "../../data/dashboardSample";

function SlotGroup({ slot, onStatusChange, editing, onToggleEdit, onSaveTimeBlock }) {
  const [expanded, setExpanded] = useState(slot.bookings.length > 0);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-visible mb-2">
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
            {slot.time}
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

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleEdit(slot.id);
            }}
            aria-label="Slot actions"
            className="w-7 h-7 flex items-center justify-center rounded-full text-gc-accent hover:bg-gc-accent/10 leading-none text-lg"
          >
            &#8942;
          </button>
        </div>

        {editing && (
          <TimeBlockEditPopover
            slot={slot}
            onClose={() => onToggleEdit(null)}
            onSave={(data) => onSaveTimeBlock(slot.id, data)}
          />
        )}
      </div>

      {expanded && slot.bookings.length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm min-w-[560px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 bg-gray-50">
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
                  <td className="py-2.5 px-4 text-gray-700 border border-gray-300">{b.name}</td>
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
    </div>
  );
}

export default function AppointmentsPanel() {
  const [slots, setSlots] = useState(appointmentSlots);
  const [openEditId, setOpenEditId] = useState(null);

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

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center">
            <NavIcon name="calendar" className="w-4 h-4" />
          </span>
          <h2 className="font-bold text-gray-800 text-sm md:text-base">
            Appointments
          </h2>
        </div>
        <span className="text-xs font-semibold text-gray-500">
          {appointmentDate}
        </span>
      </div>

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

      {slots.map((slot) => (
        <SlotGroup
          key={slot.id}
          slot={slot}
          onStatusChange={handleStatusChange}
          editing={openEditId === slot.id}
          onToggleEdit={(id) =>
            setOpenEditId((cur) => (cur === id ? null : id))
          }
          onSaveTimeBlock={handleSaveTimeBlock}
        />
      ))}
    </section>
  );
}
