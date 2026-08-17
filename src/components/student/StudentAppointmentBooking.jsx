import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

/**
 * Gordon College Clinic — Student "Book Appointment" page
 * 1:1 recreation of the provided mockups:
 *   - Mobile: 4-step wizard (Date -> Time -> Reason -> Confirmation)
 *   - Desktop: single-screen 3-column layout (Date | Time | Reason + Summary)
 *
 * Brand colors sourced from the repo's tailwind config notes:
 *   gc.green  = #044B0E  (primary / buttons / headings)
 *   gc.accent = #43AF52  (selected states / active step)
 *
 * Booking-status chips were re-colored for real contrast (WCAG AA):
 *   available -> dark green text on pale green
 *   full      -> dark red text on pale red
 */

const COLORS = {
  green: "#044B0E",
  greenHover: "#06600F",
  accent: "#43AF52",
  accentSoft: "#E7F5EA",
  red: "#B91C1C",
  redSoft: "#FCEBEB",
  gray50: "#F8FAF9",
  gray100: "#F1F3F2",
  gray200: "#E4E7E5",
  gray400: "#9AA39C",
  gray500: "#6B756D",
  gray700: "#374039",
  ink: "#1B231D",
};

const STEPS = ["Date", "Time", "Reason", "Confirmation"];

const REASONS = [
  "Medical Certificate",
  "Consultation",
  "Follow-up Checkup",
  "Vaccination",
  "Minor Injury / First Aid",
  "Others",
];

const STUDENT = {
  initials: "JR",
  name: "Joseph Daniel B. Ramos",
  course: "CCS BS Computer Science",
};

function buildMonthGrid(year, month) {
  // month: 0-indexed
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function formatDate(year, month, day) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${mm}/${dd}/${year}`;
}

function buildTimeSlots() {
  return [
    { id: "t1", label: "8:00 AM - 9:00 AM", booked: 6, capacity: 10 },
    { id: "t2", label: "9:00 AM - 10:00 AM", booked: 9, capacity: 10 },
    { id: "t3", label: "10:00 AM - 11:00 AM", booked: 10, capacity: 10 },
    { id: "t4", label: "11:00 AM - 12:00 PM", booked: 3, capacity: 10 },
    { id: "t5", label: "1:00 PM - 2:00 PM", booked: 10, capacity: 10 },
    { id: "t6", label: "2:00 PM - 3:00 PM", booked: 7, capacity: 10 },
  ];
}

function useIsDesktop(breakpoint = 900) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= breakpoint : true
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= breakpoint);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isDesktop;
}

/* ---------------------------------- UI bits ---------------------------------- */

function StepDots({ currentIndex }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: done || active ? "#fff" : COLORS.gray500,
                  backgroundColor: done ? COLORS.green : active ? COLORS.accent : COLORS.gray200,
                  transition: "background-color 150ms ease",
                }}
              >
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  color: active ? COLORS.green : COLORS.gray500,
                  letterSpacing: 0.2,
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 28,
                  height: 2,
                  marginBottom: 16,
                  marginLeft: 4,
                  marginRight: 4,
                  backgroundColor: i < currentIndex ? COLORS.green : COLORS.gray200,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PanelCard({ title, children, style }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.gray200}`,
        borderRadius: 14,
        backgroundColor: "#fff",
        padding: 18,
        ...style,
      }}
    >
      {title && (
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: COLORS.ink, marginBottom: 14 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function DatePicker({ year, month, selectedDay, onPrevMonth, onNextMonth, onSelectDay }) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "2-digit" });
  const today = new Date();
  const isCurrentMonthToday = today.getFullYear() === year && today.getMonth() === month;

  return (
    <PanelCard title="Select Date">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: `1px solid ${COLORS.gray200}`,
          borderRadius: 10,
          padding: "8px 10px",
          marginBottom: 14,
        }}
      >
        <button
          onClick={onPrevMonth}
          aria-label="Previous month"
          style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.gray700, padding: 4 }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
          <CalendarIcon size={14} color={COLORS.green} />
          {selectedDay ? formatDate(year, month, selectedDay) : `${monthLabel}/--/${year}`}
        </div>
        <button
          onClick={onNextMonth}
          aria-label="Next month"
          style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.gray700, padding: 4 }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: COLORS.gray400, padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} />;
          const isSelected = day === selectedDay;
          const isToday = isCurrentMonthToday && day === today.getDate();
          return (
            <button
              key={day}
              onClick={() => onSelectDay(day)}
              style={{
                aspectRatio: "1 / 1",
                border: isToday && !isSelected ? `1px solid ${COLORS.accent}` : "none",
                borderRadius: "999px",
                fontSize: 11.5,
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? "#fff" : COLORS.ink,
                backgroundColor: isSelected ? COLORS.accent : "transparent",
                cursor: "pointer",
                transition: "background-color 120ms ease",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
}

function TimePicker({ slots, selectedSlotId, onSelectSlot }) {
  const selected = slots.find((s) => s.id === selectedSlotId);
  return (
    <PanelCard title="Select Time">
      <div
        style={{
          border: `1px solid ${COLORS.gray200}`,
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 13,
          fontWeight: 600,
          color: selected ? COLORS.ink : COLORS.gray400,
          marginBottom: 14,
        }}
      >
        {selected ? selected.label : "Select a time slot below"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto", paddingRight: 2 }}>
        {slots.map((slot) => {
          const full = slot.booked >= slot.capacity;
          const left = slot.capacity - slot.booked;
          const pct = Math.round((slot.booked / slot.capacity) * 100);
          const isSelected = slot.id === selectedSlotId;
          const barColor = full ? COLORS.red : COLORS.accent;
          const chipBg = full ? COLORS.redSoft : COLORS.accentSoft;
          const chipColor = full ? COLORS.red : COLORS.green;

          return (
            <button
              key={slot.id}
              disabled={full}
              onClick={() => onSelectSlot(slot.id)}
              style={{
                textAlign: "left",
                border: isSelected ? `1.5px solid ${COLORS.green}` : `1px solid ${COLORS.gray200}`,
                backgroundColor: isSelected ? COLORS.accentSoft : "#fff",
                borderRadius: 10,
                padding: "9px 11px",
                cursor: full ? "not-allowed" : "pointer",
                opacity: full ? 0.75 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{slot.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    backgroundColor: chipBg,
                    color: chipColor,
                  }}
                >
                  {slot.booked}/{slot.capacity} Booked
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 999, backgroundColor: COLORS.gray100, overflow: "hidden", marginBottom: 5 }}>
                <div style={{ height: "100%", width: `${pct}%`, backgroundColor: barColor, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: full ? COLORS.red : COLORS.gray500 }}>
                {full ? "Full" : `${left} Slot${left === 1 ? "" : "s"} Left`}
              </span>
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
}

function ReasonPicker({ reason, onChange }) {
  return (
    <PanelCard title="Select Reason">
      <div style={{ position: "relative" }}>
        <select
          value={reason}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            appearance: "none",
            border: `1px solid ${COLORS.gray200}`,
            borderRadius: 10,
            padding: "10px 32px 10px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: reason ? COLORS.ink : COLORS.gray400,
            backgroundColor: "#fff",
            cursor: "pointer",
          }}
        >
          <option value="">Choose a reason...</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          color={COLORS.gray500}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
      </div>
    </PanelCard>
  );
}

function SummaryPanel({ dateLabel, timeLabel, reason, onBook, disabled, booked }) {
  const Row = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: COLORS.gray500, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: value ? COLORS.ink : COLORS.gray400, fontWeight: 600, textAlign: "right" }}>
        {value || "—"}
      </span>
    </div>
  );

  return (
    <PanelCard>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          borderLeft: `3px solid ${COLORS.accent}`,
          paddingLeft: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: COLORS.ink }}>APPOINTMENT SUMMARY</span>
      </div>
      <Row label="Date" value={dateLabel} />
      <Row label="Time" value={timeLabel} />
      <Row label="Reason" value={reason} />

      {booked ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            backgroundColor: COLORS.accentSoft,
            color: COLORS.green,
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Check size={14} strokeWidth={3} />
          Appointment booked!
        </div>
      ) : (
        <button
          onClick={onBook}
          disabled={disabled}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "11px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            backgroundColor: disabled ? COLORS.gray400 : COLORS.green,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "background-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.backgroundColor = COLORS.greenHover;
          }}
          onMouseLeave={(e) => {
            if (!disabled) e.currentTarget.style.backgroundColor = COLORS.green;
          }}
        >
          Book
        </button>
      )}
    </PanelCard>
  );
}

function NextButton({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "13px 0",
        borderRadius: 12,
        border: "none",
        fontSize: 14,
        fontWeight: 700,
        color: "#fff",
        backgroundColor: disabled ? COLORS.gray400 : COLORS.green,
        cursor: disabled ? "not-allowed" : "pointer",
        marginTop: 20,
      }}
    >
      {label}
    </button>
  );
}

/* ---------------------------------- Main component ---------------------------------- */

export default function StudentAppointmentBooking() {
  const isDesktop = useIsDesktop();

  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5); // June (0-indexed)
  const [selectedDay, setSelectedDay] = useState(6);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState(0);
  const [booked, setBooked] = useState(false);

  const slots = useMemo(() => buildTimeSlots(), []);
  const dateLabel = selectedDay ? formatDate(year, month, selectedDay) : "";
  const timeSlot = slots.find((s) => s.id === selectedSlotId);
  const timeLabel = timeSlot ? timeSlot.label : "";

  const canBook = Boolean(selectedDay && selectedSlotId && reason);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };
  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  const handleBook = () => {
    if (!canBook) return;
    setBooked(true);
  };

  const resetFlow = () => {
    setSelectedSlotId(null);
    setReason("");
    setBooked(false);
    setStep(0);
  };

  /* ---------- Desktop layout: everything visible at once ---------- */
  if (isDesktop) {
    return (
      <div style={{ backgroundColor: COLORS.gray50, minHeight: "100%", padding: "28px 24px", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.gray500, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <ArrowLeft size={15} />
              Back
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "999px",
                  backgroundColor: COLORS.green,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {STUDENT.initials}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{STUDENT.name}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accent }}>{STUDENT.course}</div>
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#fff",
              border: `1px solid ${COLORS.gray200}`,
              borderRadius: 18,
              padding: 28,
            }}
          >
            <h1 style={{ fontSize: 16, fontWeight: 800, color: COLORS.ink, marginBottom: 20, textAlign: "center" }}>
              Book Appointment
            </h1>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, alignItems: "start" }}>
              <DatePicker
                year={year}
                month={month}
                selectedDay={selectedDay}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onSelectDay={setSelectedDay}
              />
              <TimePicker slots={slots} selectedSlotId={selectedSlotId} onSelectSlot={setSelectedSlotId} />
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <ReasonPicker reason={reason} onChange={setReason} />
                <SummaryPanel
                  dateLabel={dateLabel}
                  timeLabel={timeLabel}
                  reason={reason}
                  onBook={handleBook}
                  disabled={!canBook}
                  booked={booked}
                />
                {booked && (
                  <button
                    onClick={resetFlow}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: COLORS.green,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                      alignSelf: "center",
                    }}
                  >
                    Book another appointment
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Mobile layout: 4-step wizard ---------- */
  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <>
            <DatePicker
              year={year}
              month={month}
              selectedDay={selectedDay}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onSelectDay={setSelectedDay}
            />
            <NextButton label="Next: Select Time" disabled={!selectedDay} onClick={() => setStep(1)} />
          </>
        );
      case 1:
        return (
          <>
            <TimePicker slots={slots} selectedSlotId={selectedSlotId} onSelectSlot={setSelectedSlotId} />
            <NextButton label="Next: Select Reason" disabled={!selectedSlotId} onClick={() => setStep(2)} />
          </>
        );
      case 2:
        return (
          <>
            <ReasonPicker reason={reason} onChange={setReason} />
            <NextButton label="Next: Confirmation" disabled={!reason} onClick={() => setStep(3)} />
          </>
        );
      case 3:
      default:
        return (
          <>
            <SummaryPanel
              dateLabel={dateLabel}
              timeLabel={timeLabel}
              reason={reason}
              onBook={handleBook}
              disabled={!canBook}
              booked={booked}
            />
            {booked && (
              <button
                onClick={resetFlow}
                style={{
                  width: "100%",
                  marginTop: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.green,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Book another appointment
              </button>
            )}
          </>
        );
    }
  };

  return (
    <div style={{ backgroundColor: COLORS.gray50, minHeight: "100%", padding: "24px 16px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: COLORS.ink, marginBottom: 18, textAlign: "center" }}>
          Book Appointment
        </h1>
        <StepDots currentIndex={step} />
        {stepContent()}
      </div>
    </div>
  );
}
