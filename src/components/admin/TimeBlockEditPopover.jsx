// src/components/admin/TimeBlockEditPopover.jsx
import { useEffect, useRef, useState } from "react";
import NavIcon from "./NavIcon";

const UNITS = ["Minute", "Hour"];

/**
 * slot: { time, capacity }
 * onClose: () => void
 * onSave: ({ time, slots }) => void
 */
export default function TimeBlockEditPopover({ slot, onClose, onSave }) {
  const ref = useRef(null);
  const [timeRange, setTimeRange] = useState(slot.time);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState("Hour");
  const [slotsValue, setSlotsValue] = useState(slot.capacity);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleSave() {
    const parsedSlots = Math.max(1, Number(slotsValue) || slot.capacity);
    onSave?.({ time: timeRange, slots: parsedSlots });
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute right-4 top-full mt-2 z-20 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold tracking-wide text-gray-800">
          TIME BLOCK EDIT
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <NavIcon name="x" className="w-3.5 h-3.5" />
        </button>
      </div>

      <label className="block mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-500">Time</span>
          <span className="text-xs font-semibold text-gray-700">
            {slot.time}
          </span>
        </div>
        <input
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent"
        />
      </label>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-500">Interval</span>
          <span className="text-xs font-semibold text-gray-700">
            {intervalValue} {intervalUnit}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            className="w-16 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent"
          />
          <select
            value={intervalUnit}
            onChange={(e) => setIntervalUnit(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="block mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-500">Slots</span>
          <span className="text-xs font-semibold text-gray-700">
            {slotsValue}
          </span>
        </div>
        <input
          type="number"
          min={1}
          value={slotsValue}
          onChange={(e) => setSlotsValue(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gc-accent/40 focus:border-gc-accent"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 rounded-lg bg-gc-green py-2 text-sm font-semibold text-white hover:bg-gc-green-600"
        >
          Save
        </button>
      </div>
    </div>
  );
}
