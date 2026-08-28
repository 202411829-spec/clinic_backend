// src/pages/student/Book.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SelectDateCalendar from "../../components/admin/SelectDateCalendar";
import SelectTimeSlots from "../../components/student/SelectTimeSlots";
import SelectReasonPanel from "../../components/student/SelectReasonPanel";
import AppointmentSummaryCard from "../../components/student/AppointmentSummaryCard";
import BookingStepIndicator from "../../components/student/BookingStepIndicator";
import { Link } from "react-router-dom";
import { appointmentsApi, referenceApi } from "../../lib/api.js";
import { useAppointment } from "../../context/AppointmentContext";
import { useAuth } from "../../context/AuthContext";
import { addDays, startOfDay } from "../../lib/calendar.js";

function getTomorrow() {
  return addDays(startOfDay(new Date()), 1);
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// TODO: once the backend exposes an identity mapping endpoint, resolve the
// numeric masterlist student id there instead of deriving it from the login
// email (see src/context/AuthContext.jsx).

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
  const { studentId } = useAuth();

  // Arrived here via the Dashboard's "Reschedule" action -> pre-fill with
  // the existing appointment and switch copy/behavior into reschedule mode.
  const isReschedule = Boolean(location.state?.reschedule && appointment);

  const [step, setStep] = useState(1);
  const tomorrow = getTomorrow();
  const [selectedDate, setSelectedDate] = useState(
    isReschedule ? appointment.date : getTomorrow()
  );
  const [selectedTime, setSelectedTime] = useState(
    isReschedule ? appointment.time : null
  );
  const [reasonId, setReasonId] = useState(isReschedule ? appointment.reason_id || "" : "");
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  // Real slot availability for the selected date + real reason list.
const [slots, setSlots] = useState([]);
  const [reasonList, setReasonList] = useState([]);
  const [slotsStatus, setSlotsStatus] = useState("loading");
  const [bookingError, setBookingError] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const [pendingCheckStatus, setPendingCheckStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setSlotsStatus("loading");
    appointmentsApi
      .slots(toYMD(selectedDate))
      .then((res) => {
        if (cancelled) return;
        setSlots(
          (res?.slots || []).map((s) => ({
            id: s.id,
            time: s.time,
            capacity: s.capacity,
            booked: s.booked,
            slot_start: s.slot_start,
          }))
        );
        setSlotsStatus("ready");
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load slots:", err);
          setSlots([]);
          setSlotsStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    referenceApi
      .reasons()
      .then((res) => setReasonList(res?.reasons || []))
      .catch(() => {});
  }, []);

  // Check if student already has a pending appointment. Reuses the same
  // appointmentsApi.list() that UpcomingAppointmentPanel uses, filtered to
  // pending. Reschedule mode is exempt — the user is editing that pending
  // appointment.
  useEffect(() => {
    if (isReschedule) {
      setPendingCheckStatus("ready");
      setHasPending(false);
      return undefined;
    }
    // In-memory appointment from a just-completed booking is authoritative
    // even before the backend list reflects it.
    if (appointment) {
      setHasPending(true);
      setPendingCheckStatus("ready");
      return undefined;
    }
    if (!studentId) {
      setPendingCheckStatus("ready");
      return undefined;
    }
    let cancelled = false;
    setPendingCheckStatus("loading");
    appointmentsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const rows = res?.appointments || [];
        const hasStudentField = rows.some((a) => a.student_id != null);
        const pendingRows = rows.filter((a) => {
          const status = String(a.current_status ?? a.status ?? "").toLowerCase();
          if (status !== "pending") return false;
          if (!hasStudentField) return true;
          return String(a.student_id).trim().toUpperCase() === String(studentId).trim().toUpperCase();
        });
        setHasPending(pendingRows.length > 0);
        setPendingCheckStatus("ready");
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to check pending appointments:", err);
          // Don't block booking if the check itself failed; let the backend
          // enforce the rule and surface its 400 error below.
          setPendingCheckStatus("ready");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, appointment, isReschedule]);

  function handleSelectDate(date) {
    setSelectedDate(date);
    setSelectedTime(null); // availability differs per day — clear a stale pick
  }

  // Derived: booking is blocked when a pending appointment exists (except
  // when the user arrived via Reschedule — they are editing that appointment).
  const isBookingBlocked = !isReschedule && hasPending;

  async function handleBook() {
    // Frontend guard — mirrors the backend's "only 1 pending" rule.
    if (isBookingBlocked) {
      setBookingError(
        "You already have an active appointment (pending). Please wait until it is completed or cancelled before booking again."
      );
      return;
    }
    setBookingError("");
    // Persist via POST /appointments.
    setBooking(true);
    try {
      const matchedSlot = slots.find((s) => s.time === selectedTime);
      const matchedReason = reasonList.find((r) => r.reason_id === reasonId);
      await appointmentsApi.create({
        student_id: studentId,
        slot_id: matchedSlot?.id ?? null,
        appointment_date: toYMD(selectedDate),
        appointment_time: matchedSlot?.slot_start || "08:00",
        reason_id: matchedReason?.reason_id,
        purpose: matchedReason?.description || "",
      });
      const payload = { date: selectedDate, time: selectedTime, reason: matchedReason?.description || "" };
      if (isReschedule) {
        rescheduleAppointment(payload);
      } else {
        bookAppointment(payload);
      }
      setBooked(true);
    } catch (err) {
      console.error("Booking failed:", err);
      // Surface the backend's 400 ("You already have an active appointment")
      // in the page banner so a bypassed frontend check is still visible.
      const msg = err?.message || "Couldn't book the appointment. Please try again.";
      setBookingError(msg);
      // If the backend confirmed a pending appointment exists, lock the form
      // so the user sees the same disabled state as the pre-check.
      if (/already have an active appointment/i.test(msg)) {
        setHasPending(true);
      }
    } finally {
      setBooking(false);
    }
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

      {/* Active-appointment guard + backend error banner */}
      {isBookingBlocked && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p className="font-semibold">You already have an active appointment (pending).</p>
          <p className="mt-1">Please wait until it is completed or cancelled before booking again.</p>
          <Link to="/student/dashboard" className="mt-2 inline-block font-semibold text-amber-900 underline underline-offset-2">
            View upcoming appointment
          </Link>
        </div>
      )}
      {bookingError && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {bookingError}
        </div>
      )}
      {pendingCheckStatus === "loading" && !isReschedule && (
        <p className="mb-4 text-xs text-gray-400">Checking existing appointments…</p>
      )}

      {/* ---------- Mobile: one step at a time ---------- */}
      <div className="md:hidden max-w-sm mx-auto">
        <p className="text-center font-bold text-gray-800 text-sm mb-3">{pageTitle}</p>
        <BookingStepIndicator step={step} onStepClick={setStep} />

        {step === 1 && (
          <div className="space-y-4">
            <SelectDateCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              navigationMode="month"
              minDate={tomorrow}
            />
            <p className="text-xs text-gray-500 text-center">Booking is available starting tomorrow</p>
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
              status={slotsStatus}
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
            <SelectReasonPanel reasons={reasonList} reasonId={reasonId} onSelectReason={setReasonId} />
            <button
              type="button"
              disabled={!reasonId}
              onClick={() => setStep(4)}
              className={[
                "w-full rounded-lg py-2.5 text-sm font-bold transition-colors",
                reasonId
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
            reason={reasonList.find((r) => r.reason_id === Number(reasonId))?.description || ""}
            booking={booking}
            onBook={handleBook}
            actionLabel={summaryActionLabel}
            loadingLabel={summaryLoadingLabel}
            disabled={isBookingBlocked || pendingCheckStatus === "loading"}
            disabledReason={
              isBookingBlocked
                ? "You already have an active appointment (pending)."
                : undefined
            }
          />
        )}
      </div>

      {/* ---------- Desktop: all panels visible at once ---------- */}
      <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr] md:gap-5 md:items-start">
        <div>
          <SelectDateCalendar
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            navigationMode="month"
            minDate={tomorrow}
          />
          <p className="text-xs text-gray-500 text-center mt-2">Booking is available starting tomorrow</p>
        </div>
        <SelectTimeSlots
          slots={slots}
          selectedTime={selectedTime}
          onSelectTime={setSelectedTime}
        />
        <SelectReasonPanel reasons={reasonList} reasonId={reasonId} onSelectReason={setReasonId} />
        <AppointmentSummaryCard
          date={selectedDate}
          time={selectedTime}
          reason={reasonList.find((r) => r.reason_id === Number(reasonId))?.description || ""}
          booking={booking}
          onBook={handleBook}
          actionLabel={summaryActionLabel}
          loadingLabel={summaryLoadingLabel}
          disabled={isBookingBlocked || pendingCheckStatus === "loading"}
          disabledReason={
            isBookingBlocked ? "You already have an active appointment (pending)." : undefined
          }
        />
      </div>
    </div>
  );
}
