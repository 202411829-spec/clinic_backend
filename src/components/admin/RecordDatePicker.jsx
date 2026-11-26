// src/components/admin/RecordDatePicker.jsx
// GC-RFB single-date field for the Medical Records forms. Reuses the existing
// clinic-green calendar, trigger button, portal overlay, and origin motion;
// only the value contract changes (caller keeps an ISO "YYYY-MM-DD" string).
import { useRef, useState } from "react";
import { CalendarTriggerButton } from "../ui/DateRangePicker.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import SelectDateCalendar from "./SelectDateCalendar.jsx";
import { GC_MODAL_CLOSE_MS, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion.js";
import { formatRecordDate, formatRecordDateLabel, parseRecordDate } from "../../lib/recordDate.js";

export default function RecordDatePicker({
  value,
  onChange,
  label = "date",
  placeholder = "Select date",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const origin = useTriggerOrigin({
    enabled: open && mounted,
    panelRef,
    triggerRef,
  });
  const selectedDate = parseRecordDate(value);

  return (
    <div className="relative">
      <CalendarTriggerButton
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Select ${label}`}
        placeholder={!selectedDate}
        className="text-sm"
      >
        {selectedDate ? formatRecordDateLabel(selectedDate) : placeholder}
      </CalendarTriggerButton>

      {mounted && (
        <PortalOverlay
          triggerRef={triggerRef}
          panelRef={panelRef}
          enabled={mounted}
          align="left"
          preferredWidth={320}
          estimatedHeight={420}
          role="dialog"
          ariaLabel={`Select ${label}`}
          className={`gc-cal-pop gc-cal-pop-portal gc-modal-panel ${origin.className} ${visible ? "is-open" : "is-close"}`}
          style={origin.style}
          onOutside={() => setOpen(false)}
          onEscape={() => setOpen(false)}
        >
          <SelectDateCalendar
            selectedDate={selectedDate}
            onSelectDate={(nextDate) => {
              onChange?.(nextDate ? formatRecordDate(nextDate) : "");
              setOpen(false);
            }}
            navigationMode="month"
          />
        </PortalOverlay>
      )}
    </div>
  );
}
