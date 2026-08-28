// src/components/admin/ClinicScheduleFullPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import NavIcon from "./NavIcon.jsx";
import ScheduleCalendar from "./ScheduleCalendar.jsx";
import TimeBlockEditPopover from "./TimeBlockEditPopover.jsx";
import { generateTimeBlocks } from "../../lib/schedule.js";
import { clinicScheduleApi } from "../../lib/api.js";
import { formatMDY } from "../../lib/calendar.js";

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

function toYMDLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
      <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-4 py-2.5">
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

const DEFAULT_OPEN_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export default function ClinicScheduleFullPanel() {
  const [selectedDates, setSelectedDates] = useState([new Date()]);
  const [selectedWeekdays, setSelectedWeekdays] = useState(DEFAULT_OPEN_WEEKDAYS);
  const [calendarMode, setCalendarMode] = useState("specific");
  const [bookingEnabledMap, setBookingEnabledMap] = useState({});
  const [bookingSaving, setBookingSaving] = useState(false);

  const [workStart, setWorkStart] = useState("08:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [numStudents, setNumStudents] = useState(100);

  const [blocks, setBlocks] = useState([]);
  const [openEditId, setOpenEditId] = useState(null);
  const [savedMessage, setSavedMessage] = useState("");

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

  // Load the clinic's saved default settings on mount.
  useEffect(() => {
    clinicScheduleApi
      .getSettings()
      .then((res) => {
        const s = res?.settings;
        if (!s) return;
        if (s.work_start) setWorkStart(String(s.work_start).slice(0, 5));
        if (s.work_end) setWorkEnd(String(s.work_end).slice(0, 5));
        if (s.break_start) setBreakStart(String(s.break_start).slice(0, 5));
        if (s.break_end) setBreakEnd(String(s.break_end).slice(0, 5));
      })
      .catch((err) => console.error("Failed to load clinic settings:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch per-date is_enabled for selectedDates to drive booking pill + calendar closed styling.
  // If no override exists, inherit weekday default (open if weekday is in selectedWeekdays).
  useEffect(() => {
    if (calendarMode !== "specific" || selectedDates.length === 0) {
      setBookingEnabledMap({});
      return;
    }
    let cancelled = false;
    async function load() {
      const next = {};
      await Promise.all(
        selectedDates.map(async (d) => {
          const ymd = toYMDLocal(d);
          try {
            const res = await clinicScheduleApi.byDate(ymd);
            const sched = res?.schedule;
            if (sched && typeof sched.is_enabled === "boolean") {
              next[ymd] = sched.is_enabled;
            } else {
              next[ymd] = selectedWeekdays.includes(d.getDay());
            }
          } catch {
            next[ymd] = selectedWeekdays.includes(d.getDay());
          }
        })
      );
      if (!cancelled) setBookingEnabledMap(next);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDates, selectedWeekdays, calendarMode]);

  function resolveBookingEnabled(date) {
    const ymd = toYMDLocal(date);
    if (ymd in bookingEnabledMap) return bookingEnabledMap[ymd];
    return selectedWeekdays.includes(date.getDay());
  }

  const bookingValues = selectedDates.map(resolveBookingEnabled);
  const allOpen = bookingValues.length > 0 && bookingValues.every((v) => v === true);
  const allClosed = bookingValues.length > 0 && bookingValues.every((v) => v === false);
  const mixed = !allOpen && !allClosed;

  function getBookingLabel() {
    if (selectedDates.length === 1) {
      const label = selectedDates[0].toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `Booking for ${label}:`;
    }
    if (mixed) return `Booking for ${selectedDates.length} dates — Mixed:`;
    if (allOpen) return `Booking for ${selectedDates.length} dates — all open:`;
    if (allClosed) return `Booking for ${selectedDates.length} dates — all closed:`;
    return `Booking for ${selectedDates.length} dates:`;
  }

  async function handleSetBooking(isEnabled) {
    setBookingSaving(true);
    try {
      await Promise.all(
        selectedDates.map((d) =>
          clinicScheduleApi.createOverride({
            working_date: toYMDLocal(d),
            is_enabled: isEnabled,
            slot_start: workStart,
            slot_end: workEnd,
            break_start: breakStart || null,
            break_end: breakEnd || null,
          })
        )
      );
      const next = { ...bookingEnabledMap };
      selectedDates.forEach((d) => {
        next[toYMDLocal(d)] = isEnabled;
      });
      setBookingEnabledMap(next);
      const dateLabel =
        selectedDates.length > 1 ? `${selectedDates.length} dates` : formatMDY(selectedDates[0]);
      setSavedMessage(`Booking ${isEnabled ? "open" : "closed"} for ${dateLabel}.`);
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (err) {
      console.error("Failed to set booking:", err);
      setSavedMessage("Failed to update booking. Check console for details.");
      window.setTimeout(() => setSavedMessage(""), 3000);
    } finally {
      setBookingSaving(false);
    }
  }

  function handleSaveBlock(blockId, data) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, time: data.time, capacity: data.slots } : b))
    );
  }

  function handleDeleteBlock(blockId) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  async function handleUpdateSchedule() {
    const failures = [];

    // 1) Persist global defaults.
    try {
      await clinicScheduleApi.updateSettings({
        work_start: workStart,
        work_end: workEnd,
        break_start: breakStart,
        break_end: breakEnd,
        max_students_per_slot: Number(computed.slotsPerBlock) || undefined,
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
      failures.push("Settings");
    }

    // 2) Persist per-date overrides — track each date individually.
    const results = await Promise.allSettled(
      selectedDates.map((d) =>
        clinicScheduleApi.createOverride({
          working_date: toYMDLocal(d),
          slot_start: workStart,
          slot_end: workEnd,
          break_start: breakStart || null,
          break_end: breakEnd || null,
          is_enabled: true,
        })
      )
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`Failed to save override for ${selectedDates[i]}:`, result.reason);
        failures.push(`Date ${toYMDLocal(selectedDates[i])}`);
      }
    });

    // 3) Show toast ONLY if ALL succeeded; otherwise show explicit error list.
    if (failures.length === 0) {
      const dateLabel =
        selectedDates.length > 1
          ? `${selectedDates.length} dates`
          : formatMDY(selectedDates[0]);
      setSavedMessage(`Schedule updated for ${dateLabel}.`);
    } else {
      setSavedMessage(
        `Failed to update: ${failures.join(", ")}. Check console for details.`
      );
    }
    window.setTimeout(() => setSavedMessage(""), 3000);
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
      {/* header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-md bg-gc-green/10 text-gc-green flex items-center justify-center shrink-0">
          <NavIcon name="calendar" className="w-4 h-4" />
        </span>
        <h1 className="font-bold text-gc-green text-base md:text-lg leading-tight">
          Clinic Schedule
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-5 items-stretch">
        {/* left: calendar */}
        <ScheduleCalendar
          selectedDates={selectedDates}
          onChange={setSelectedDates}
          selectedWeekdays={selectedWeekdays}
          onWeekdaysChange={setSelectedWeekdays}
          mode={calendarMode}
          onModeChange={setCalendarMode}
          bookingEnabledMap={bookingEnabledMap}
          bookingLabel={
            calendarMode === "specific" && selectedDates.length >= 1
              ? getBookingLabel()
              : null
          }
          allOpen={allOpen}
          allClosed={allClosed}
          mixed={mixed}
          onSetBooking={handleSetBooking}
          bookingSaving={bookingSaving}
        />

        {/* middle: working hours / break time / time block config — self-start
            so it hugs its own content instead of stretching to match the
            taller calendar/preview columns */}
        <div className="self-start border border-gray-200 rounded-2xl p-4 md:p-5 space-y-4">
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

        {/* right: live preview — capped at all breakpoints (viewport-relative
            on lg screens) so a long block list scrolls within this panel
            instead of stretching the grid row and forcing the whole page
            to scroll. */}
        <div className="border border-gray-200 rounded-2xl p-4 md:p-5 flex flex-col max-h-[420px] lg:max-h-[calc(100vh-160px)]">
          <h3 className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-3 shrink-0">
            Time Block Preview
          </h3>
          <div className="space-y-2 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
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

      {/* footer: update schedule only — booking pill now lives inside ScheduleCalendar below Tip */}
      <div className="mt-4 border-t border-gray-100 pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 min-w-0">
          {savedMessage && (
            <p className="text-sm font-semibold text-gc-green">{savedMessage}</p>
          )}
        </div>
        <button
          onClick={handleUpdateSchedule}
          className="w-full md:w-auto shrink-0 rounded-xl bg-gc-green px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gc-green-600 transition-colors"
        >
          Update Schedule
        </button>
      </div>
    </section>
  );
}
