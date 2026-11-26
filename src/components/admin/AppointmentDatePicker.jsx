// src/components/admin/AppointmentDatePicker.jsx
import { useRef, useState } from "react";
import { CalendarTriggerButton } from "../ui/DateRangePicker.jsx";
import PortalOverlay from "../ui/PortalOverlay.jsx";
import SelectDateCalendar from "./SelectDateCalendar.jsx";
import { GC_MODAL_CLOSE_MS, useModalPresence, useTriggerOrigin } from "../../lib/gcMotion.js";
import { formatLongDate } from "../../lib/calendar.js";

export default function AppointmentDatePicker({ selectedDate, onSelectDate }) {
  const [open, setOpen] = useState(false);
  const { mounted, visible } = useModalPresence(open, GC_MODAL_CLOSE_MS);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const origin = useTriggerOrigin({
    enabled: open && mounted,
    panelRef,
    triggerRef,
  });

  return (
    <div className="relative shrink-0">
      <CalendarTriggerButton
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Select appointment date"
        className="whitespace-nowrap"
      >
        {formatLongDate(selectedDate)}
      </CalendarTriggerButton>

      {mounted && (
        <PortalOverlay
          triggerRef={triggerRef}
          panelRef={panelRef}
          enabled={mounted}
          align="right"
          preferredWidth={320}
          estimatedHeight={420}
          role="dialog"
          ariaLabel="Select appointment date"
          className={`gc-modal-panel ${origin.className} ${visible ? "is-open" : "is-close"}`}
          style={origin.style}
          onOutside={() => setOpen(false)}
          onEscape={() => setOpen(false)}
        >
          <SelectDateCalendar
            selectedDate={selectedDate}
            onSelectDate={(nextDate) => {
              onSelectDate?.(nextDate);
              setOpen(false);
            }}
            navigationMode="month"
          />
        </PortalOverlay>
      )}
    </div>
  );
}
