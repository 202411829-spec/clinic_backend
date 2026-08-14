// src/components/admin/ClinicScheduleFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon";
import ScheduleCalendar, { DEFAULT_OPEN_WEEKDAYS } from "./ScheduleCalendar";
import TimeBlockEditPopover from "./TimeBlockEditPopover";
import { generateTimeBlocks } from "../../lib/schedule";
import { formatMDY, WEEKDAY_LABELS } from "../../lib/calendar";

function InfoDot({ label }) {
  return (
    <span
      title={label}
      tabIndex={0}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gc-green/40 text-gc-green text-[10px] font-bold cursor-help shrink-0"
      aria-label={label}
    >
      i
    </span>
  );
}

function TimeBlockRow({ block, onToggleEdit, editing, onSave, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-3">
        <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
          {block.time}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {/* Slots are set once per generated schedule and stay fixed per block,
              regardless of later time edits on this or other blocks. */}
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
            {block.capacity} Slot{block.capacity === 1 ? "" : "s"}
          </span>

          <div className="relative" ref={menuWrapRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`Actions for ${block.time}`}
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <NavIcon name="dots" className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-32 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleEdit(block.id);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(block.id);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <TimeBlockEditPopover
          slot={block}
          onClose={() => onToggleEdit(null)}
          onSave={(data) => onSave(block.id, data)}
        />
      )}
    </div>
  );
}

export default function ClinicScheduleFullPanel() {
  const [selectedDates, setSelectedDates] = useState([new Date(2026, 5, 6)]);
  const [scheduleMode, setScheduleMode] = useState("date"); // "date" | "days"
  const [selectedWeekdays, setSelectedWeekdays] = useState(DEFAULT_OPEN_WEEKDAYS);

  const [workStart, setWorkStart] = useState("08:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [numStudents, setNumStudents] = useState(100);

  const [blocks, setBlocks] = useState([]);
  const [openEditId, setOpenEditId] = useState(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [bookingOpenMessage, setBookingOpenMessage] = useState("");

  const computed = useMemo(
    () => generateTimeBlocks({ workStart, workEnd, breakStart, breakEnd, numStudents }),
    [workStart, workEnd, breakStart, breakEnd, numStudents]
  );

  // Re-derive the preview list whenever the inputs that drive it change.
  // Manual per-block edits (via the popover) are layered on top until the
  // next time the underlying inputs change.
  useEffect(() => {
    setBlocks(computed.blocks);
  }, [computed]);

  function handleSaveBlock(blockId, data) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, time: data.time, capacity: data.slots } : b))
    );
  }

  function handleDeleteBlock(blockId) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  function handleUpdateSchedule() {
    const dateLabel =
      scheduleMode === "days"
        ? `${selectedWeekdays.map((i) => WEEKDAY_LABELS[i]).join(", ")} (every week)`
        : selectedDates.length > 1
        ? `${selectedDates.length} dates`
        : formatMDY(selectedDates[0]);
    setSavedMessage(`Schedule updated for ${dateLabel}.`);
    window.setTimeout(() => setSavedMessage(""), 3000);
  }

  function handleOpenBooking() {
    const dateLabel =
      scheduleMode === "days"
        ? `${selectedWeekdays.map((i) => WEEKDAY_LABELS[i]).join(", ")} (every week)`
        : selectedDates.length > 1
        ? `${selectedDates.length} dates`
        : formatMDY(selectedDates[0]);
    setBookingOpenMessage(`Booking is now open for ${dateLabel}.`);
    window.setTimeout(() => setBookingOpenMessage(""), 3000);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6">
      {/* header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name="calendar" className="w-4 h-4" />
        </span>
        <h1 className="font-bold text-gc-green text-base md:text-lg leading-tight">
          Clinic Schedule
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-5 items-start">
        {/* left: calendar */}
        <ScheduleCalendar
          selectedDates={selectedDates}
          onChange={setSelectedDates}
          scheduleMode={scheduleMode}
          onScheduleModeChange={setScheduleMode}
          selectedWeekdays={selectedWeekdays}
          onWeekdaysChange={setSelectedWeekdays}
        />

        {/* middle: working hours / break time / time block config */}
        <div className="border border-gray-200 rounded-2xl p-4 md:p-5 space-y-5">
          <div>
            <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-2">
              Working Hours
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">Start</span>
                <input
                  type="time"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/30"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">End</span>
                <input
                  type="time"
                  value={workEnd}
                  onChange={(e) => setWorkEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/30"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-2">
              Break Time
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">Start</span>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/30"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">End</span>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/30"
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-2">
              Time Block
            </h3>
            <label className="block mb-3">
              <span className="block text-xs font-semibold text-gray-500 mb-1">
                Number of Students
              </span>
              <input
                type="number"
                min="0"
                value={numStudents}
                onChange={(e) => setNumStudents(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/30"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1">
                  Slots per time block
                  <InfoDot label="Automatically calculated from the number of students divided across your available time blocks." />
                </span>
                <input
                  readOnly
                  value={computed.slotsPerBlock}
                  className="w-full border border-gc-green/30 bg-gc-green-50 rounded-lg px-3 py-2.5 text-sm text-gray-700"
                />
              </div>
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1">
                  Number of Time Block
                  <InfoDot label="Automatically calculated from your working hours minus break time, in 1-hour blocks." />
                </span>
                <input
                  readOnly
                  value={computed.numBlocks}
                  className="w-full border border-gc-green/30 bg-gc-green-50 rounded-lg px-3 py-2.5 text-sm text-gray-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* right: live preview */}
        <div className="border border-gray-200 rounded-2xl p-4 md:p-5">
          <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-3">
            Time Block Preview
          </h3>
          <div className="space-y-2.5">
            {blocks.map((block) => (
              <TimeBlockRow
                key={block.id}
                block={block}
                editing={openEditId === block.id}
                onToggleEdit={(id) => setOpenEditId((cur) => (cur === id ? null : id))}
                onSave={handleSaveBlock}
                onDelete={handleDeleteBlock}
              />
            ))}
            {blocks.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-6">
                Adjust working hours or break time to generate time blocks.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* footer: save + open booking actions */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-end gap-3">
        {(savedMessage || bookingOpenMessage) && (
          <p className="text-sm font-semibold text-gc-green">
            {savedMessage || bookingOpenMessage}
          </p>
        )}
        <button
          onClick={handleOpenBooking}
          className="w-full md:w-auto rounded-xl bg-gc-accent px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-colors"
        >
          Open Booking
        </button>
        <button
          onClick={handleUpdateSchedule}
          className="w-full md:w-auto rounded-xl bg-gc-green px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gc-green-600 transition-colors"
        >
          Update Schedule
        </button>
      </div>
    </section>
  );
}
