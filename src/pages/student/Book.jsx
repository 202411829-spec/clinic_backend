// src/pages/student/Book.jsx
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SelectDateCalendar from "../../components/admin/SelectDateCalendar";
import SelectTimeSlots from "../../components/student/SelectTimeSlots";
import SelectReasonPanel from "../../components/student/SelectReasonPanel";
import AppointmentSummaryCard from "../../components/student/AppointmentSummaryCard";
import BookingStepIndicator from "../../components/student/BookingStepIndicator";
import { generateDaySlots } from "../../lib/timeSlots";
import { useAppointment } from "../../context/AppointmentContext";

// TODO: swap for the student's actual next-available booking date /
// a real Supabase-backed availability query once the backend is ready.
const DEFAULT_DATE = new Date(2026, 7, 6); // Aug 6, 2026 — matches the mockup

function SuccessPanel({ rescheduling, onDone }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-gc-accent/10 text-gc-accent flex items-center justify-center mx-auto mb-4">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-7 h-7"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <p className="font-bold text-gray-800">
        {rescheduling ? "Appointment Rescheduled!" : "Appointment Booked!"}
      </p>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        You'll get a notification once the clinic confirms your slot.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-lg bg-gc-green py-2.5 text-sm font-bold text-white hover:bg-gc-green-600"
      >
        Back to Dashboard
      </button>
    </section>
  );
}

export default function Book() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appointment, bookAppointment, rescheduleAppointment } = useAppointment();

  // Arrived here via the Dashboard's "Reschedule" action -> pre-fill with
  // the existing appointment and switch copy/behavior into reschedule mode.
  const isReschedule = Boolean(location.state?.reschedule && appointment);

  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(
    isReschedule ? appointment.date : DEFAULT_DATE
  );
  const [selectedTime, setSelectedTime] = useState(
    isReschedule ? appointment.time : null
  );
  const [reason, setReason] = useState(isReschedule ? appointment.reason : "");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  const slots = useMemo(() => generateDaySlots(selectedDate), [selectedDate]);

  function handleSelectDate(date) {
    setSelectedDate(date);
    setSelectedTime(null); // availability differs per day — clear a stale pick
  }

  function handleBook() {
    // TODO: replace with a real Supabase insert/update
    // (student id, date, time, reason).
    setBooking(true);
    setTimeout(() => {
      setBooking(false);
      setBooked(true);
      const payload = { date: selectedDate, time: selectedTime, reason };
      if (isReschedule) {
        rescheduleAppointment(payload);
      } else {
        bookAppointment(payload);
      }
    }, 600);
  }

  function goToDashboard() {
    navigate("/student/dashboard");
  }

  if (booked) {
    return (
      <div className="pt-6 md:pt-10">
        <SuccessPanel rescheduling={isReschedule} onDone={goToDashboard} />
      </div>
    );
  }

  const pageTitle = isReschedule ? "Reschedule Appointment" : "Book an Appointment";
  const summaryActionLabel = isReschedule ? "Confirm Reschedule" : "Book";
  const summaryLoadingLabel = isReschedule ? "Rescheduling…" : "Booking…";

  return (
    <div className="pt-2 md:pt-6">
      <h1 className="hidden md:block font-bold text-gray-800 text-lg mb-5">
        {pageTitle}
      </h1>

      {/* ---------- Mobile: one step at a time ---------- */}
      <div className="md:hidden max-w-sm mx-auto">
        <p className="text-center font-bold text-gray-800 text-sm mb-3">{pageTitle}</p>
        <BookingStepIndicator step={step} onStepClick={setStep} />

        {step === 1 && (
          <div className="space-y-4">
            <SelectDateCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-gc-green py-2.5 text-sm font-bold text-white hover:bg-gc-green-600"
            >
              Next: Select Time
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SelectTimeSlots
              slots={slots}
              selectedTime={selectedTime}
              onSelectTime={setSelectedTime}
            />
            <button
              type="button"
              disabled={!selectedTime}
              onClick={() => setStep(3)}
              className={[
                "w-full rounded-lg py-2.5 text-sm font-bold transition-colors",
                selectedTime
                  ? "bg-gc-green text-white hover:bg-gc-green-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed",
              ].join(" ")}
            >
              Next: Select Reason
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <SelectReasonPanel reason={reason} onSelectReason={setReason} />
            <button
              type="button"
              disabled={!reason}
              onClick={() => setStep(4)}
              className={[
                "w-full rounded-lg py-2.5 text-sm font-bold transition-colors",
                reason
                  ? "bg-gc-green text-white hover:bg-gc-green-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed",
              ].join(" ")}
            >
              Next: Confirmation
            </button>
          </div>
        )}

        {step === 4 && (
          <AppointmentSummaryCard
            date={selectedDate}
            time={selectedTime}
            reason={reason}
            booking={booking}
            onBook={handleBook}
            actionLabel={summaryActionLabel}
            loadingLabel={summaryLoadingLabel}
          />
        )}
      </div>

      {/* ---------- Desktop: all panels visible at once ---------- */}
      <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr] md:gap-5 md:items-start">
        <SelectDateCalendar selectedDate={selectedDate} onSelectDate={handleSelectDate} />
        <SelectTimeSlots
          slots={slots}
          selectedTime={selectedTime}
          onSelectTime={setSelectedTime}
        />
        <SelectReasonPanel reason={reason} onSelectReason={setReason} />
        <AppointmentSummaryCard
          date={selectedDate}
          time={selectedTime}
          reason={reason}
          booking={booking}
          onBook={handleBook}
          actionLabel={summaryActionLabel}
          loadingLabel={summaryLoadingLabel}
        />
      </div>
    </div>
  );
}
