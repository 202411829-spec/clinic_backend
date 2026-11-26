// src/pages/student/Book.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SelectDateCalendar from "../../components/admin/SelectDateCalendar.jsx";
import SelectTimeSlots from "../../components/student/SelectTimeSlots.jsx";
import SelectReasonPanel from "../../components/student/SelectReasonPanel.jsx";
import AppointmentSummaryCard from "../../components/student/AppointmentSummaryCard.jsx";
import BookingStepIndicator from "../../components/student/BookingStepIndicator.jsx";
import { Link } from "react-router-dom";
import { appointmentsApi, clinicScheduleApi, referenceApi } from "../../lib/api.js";
import { useAppointment } from "../../context/AppointmentContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { addDays, formatMDY, startOfDay, toYMD } from "../../lib/calendar.js";
import { formatTimeRange } from "../../lib/timeFormat.js";
import { buildAppointmentPayload, canStartBooking } from "../../lib/appointmentPayload.js";
import {
  availabilityDates,
  canProceed,
  clearOnReasonChange,
  findReason,
  isDedicatedReason,
  isReasonSelected,
  normalizeReasonId,
  summarizeSelection,
} from "../../lib/bookingFlow.js";

function getTomorrow() {
  return addDays(startOfDay(new Date()), 1);
}

// TODO: once the backend exposes an identity mapping endpoint, resolve the
// numeric masterlist student id there instead of deriving it from the login
// email (see src/context/AuthContext.jsx).

function SuccessPanel({ rescheduling, onDone }) {
  return (
    <section className="mx-auto max-w-md animate-fade-in-up rounded-panel bg-white p-8 text-center shadow-e3 motion-reduce:animate-none">
      <div className="w-14 h-14 rounded-full mx-auto mb-4 flex animate-scale-in items-center justify-center bg-brand-50 text-brand-700 ring-8 ring-brand-50/60">
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
      <p className="text-lg font-semibold text-ink-900">
        {rescheduling ? "Appointment Rescheduled!" : "Appointment Booked!"}
      </p>
      <p className="mb-5 mt-1 text-sm text-ink-500">
        You'll get a notification once the clinic confirms your slot.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="btn-primary btn-press btn-shine w-full py-2.5"
      >
        Done
      </button>
    </section>
  );
}

// Card-shaped placeholder shown until a step's prerequisite exists (reason
// before the calendar, date before the times, all three before summary).
function GatedPanel({ title, message }) {
  return (
    <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
      <div className="mb-3 border-l-4 border-brand-600 pl-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-900">
          {title}
        </h2>
      </div>
      <p className="rounded-control border border-ink-200 px-3 py-5 text-center text-sm text-ink-400">
        {message}
      </p>
    </section>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <span
        className={[
          "cell-wrap text-right text-sm font-medium",
          value ? "text-ink-900" : "text-ink-300",
        ].join(" ")}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// Step 4 recap — read-only. The actual submit lives on step 5 so Confirm is
// its own step with its own action.
function SummaryPanel({ date, time, reason }) {
  return (
    <section className="card-hover rounded-panel bg-white p-4 shadow-e2 md:p-5">
      <div className="mb-3 border-l-4 border-brand-600 pl-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-900">
          Appointment summary
        </h2>
      </div>
      <div className="divide-y divide-ink-100">
        <SummaryRow label="Date" value={date ? formatMDY(date) : ""} />
        <SummaryRow label="Time" value={formatTimeRange(time)} />
        <SummaryRow label="Reason" value={reason} />
      </div>
    </section>
  );
}

function stepButtonClass(enabled) {
  return [
    "btn btn-press w-full py-2.5 font-semibold transition-colors disabled:active:scale-100",
    enabled
      ? "bg-brand-900 text-white shadow-e1 hover:bg-brand-800"
      : "bg-ink-100 text-ink-400 cursor-not-allowed",
  ].join(" ");
}

export default function Book() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appointment, bookAppointment, rescheduleAppointment } = useAppointment();
  const { studentId } = useAuth();

  // Arrived here via the Dashboard's "Reschedule" action -> pre-fill with
  // the existing appointment and switch copy/behavior into reschedule mode.
  // The intent to reschedule (the nav flag) is separate from having the
  // appointment's data in hand: the in-memory `appointment` from context is
  // only populated for a booking made earlier *this session* — if the
  // pending appointment instead came from the backend (the normal case,
  // e.g. after a refresh), context is empty and we must fetch it ourselves
  // using the appointmentId the Dashboard passed along.
  const wantsReschedule = Boolean(location.state?.reschedule);
  const appointmentIdParam = location.state?.appointmentId;
  const [fetchedAppt, setFetchedAppt] = useState(null);
  const [rescheduleDataReady, setRescheduleDataReady] = useState(
    !wantsReschedule || Boolean(appointment)
  );
  const rescheduleSource = appointment || fetchedAppt;
  const isReschedule = wantsReschedule && rescheduleDataReady && Boolean(rescheduleSource);

  useEffect(() => {
    if (!wantsReschedule || appointment) return undefined;
    if (!appointmentIdParam) {
      setRescheduleDataReady(true);
      return undefined;
    }
    let cancelled = false;
    appointmentsApi
      .get(appointmentIdParam)
      .then((res) => {
        if (cancelled) return;
        const a = res?.appointment || res;
        if (a?.appointment_date) {
          setFetchedAppt({
            date: new Date(`${String(a.appointment_date).slice(0, 10)}T00:00:00`),
            rawTime: a.appointment_time,
            reason_id: a.reason_id ?? "",
          });
        }
      })
      .catch((err) => console.error("Failed to load appointment for reschedule:", err))
      .finally(() => {
        if (!cancelled) setRescheduleDataReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Only needs to run once per visit — the fetched value is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reason-first flow: nothing but the reason is picked up front. A fresh
  // booking starts with no date/time at all (the calendar and slots only
  // load once a reason is chosen); reschedule mode keeps its prefills.
  const [step, setStep] = useState(1);
  const tomorrow = getTomorrow();
  const [selectedDate, setSelectedDate] = useState(
    appointment && wantsReschedule ? appointment.date : null
  );
  const [selectedTime, setSelectedTime] = useState(
    appointment && wantsReschedule ? appointment.time : null
  );
  const [reasonId, setReasonId] = useState(
    appointment && wantsReschedule ? normalizeReasonId(appointment.reason_id) : ""
  );
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const bookingInFlightRef = useRef(false);

  // Sync the form once a fetched (backend) reschedule source resolves —
  // the context-based case above is already set synchronously at mount.
  useEffect(() => {
    if (!fetchedAppt) return;
    setSelectedDate(fetchedAppt.date);
    setReasonId(normalizeReasonId(fetchedAppt.reason_id));
  }, [fetchedAppt]);

  // Slots for the selected date + reason, and the real reason list.
  const [slots, setSlots] = useState([]);
  const [reasonList, setReasonList] = useState([]);
  const [slotsStatus, setSlotsStatus] = useState("idle");
  const [bookingError, setBookingError] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const [pendingCheckStatus, setPendingCheckStatus] = useState("loading");

  // Dedicated reasons (Dental Service) load their own schedule so the
  // calendar can offer only those dates. Non-dedicated reasons keep the
  // legacy general availability — no extra request, nothing restricted.
  const reasonReady = isReasonSelected(reasonId);
  const reasonRecord = findReason(reasonList, reasonId);
  const dedicatedSchedule = isDedicatedReason(reasonList, reasonId);
  const [scheduleRows, setScheduleRows] = useState(null);

  useEffect(() => {
    if (!reasonReady || !dedicatedSchedule) {
      setScheduleRows(null);
      return undefined;
    }
    let cancelled = false;
    clinicScheduleApi
      .list({ reason_id: normalizeReasonId(reasonId) })
      .then((res) => {
        if (cancelled) return;
        setScheduleRows(Array.isArray(res?.schedule) ? res.schedule : []);
      })
      .catch((err) => {
        console.error("Failed to load reason schedule:", err);
        // No usable schedule -> no selectable dates; never fall back to
        // the general schedule's availability.
        if (!cancelled) setScheduleRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reasonReady, dedicatedSchedule, reasonId]);

  const availability = availabilityDates({
    reason: reasonRecord,
    schedule: scheduleRows,
    minDate: tomorrow,
  });
  const availableDates = availability.dates; // null = unrestricted

  // Slots only load once both a reason and a date exist — and always with
  // the reason_id so the backend answers from that reason's schedule.
  const slotsDate = selectedDate ? toYMD(selectedDate) : "";
  const slotsReasonId = reasonReady ? normalizeReasonId(reasonId) : "";

  useEffect(() => {
    if (!slotsDate || !slotsReasonId) {
      setSlots([]);
      setSlotsStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setSlotsStatus("loading");
    appointmentsApi
      .slots(slotsDate, slotsReasonId)
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
  }, [slotsDate, slotsReasonId]);

  // Once that date's real slots load, match the old appointment's time to
  // one of them (by start time) so the calendar shows the right slot
  // pre-selected instead of leaving it blank.
  useEffect(() => {
    if (!fetchedAppt?.rawTime || selectedTime) return;
    if (slotsStatus !== "ready") return;
    const norm = String(fetchedAppt.rawTime).slice(0, 5);
    const match = slots.find((s) => String(s.slot_start).slice(0, 5) === norm);
    if (match) setSelectedTime(match.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAppt, slots, slotsStatus]);

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
    // Still resolving the reschedule source (fetching the old appointment) —
    // hold off on the normal pending-check so the blocked banner doesn't
    // flash on screen before flipping into reschedule mode.
    if (wantsReschedule) {
      setPendingCheckStatus("loading");
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
      .list({ student_id: studentId, date_from: toYMD(new Date()) })
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
  }, [studentId, appointment, isReschedule, wantsReschedule]);

  // Changing the reason invalidates everything derived from the old one:
  // date, time, slots and calendar availability are cleared, the new
  // reason's availability reloads below, and the flow restarts at step 1.
  function handleSelectReason(nextReasonId) {
    const next = normalizeReasonId(nextReasonId);
    if (next === normalizeReasonId(reasonId)) return;
    const cleared = clearOnReasonChange();
    setReasonId(next);
    setSelectedDate(cleared.selectedDate);
    setSelectedTime(cleared.selectedTime);
    setSlots(cleared.slots);
    setSlotsStatus(cleared.slotsStatus);
    setScheduleRows(cleared.availableDates);
    setStep(1);
  }

  function handleSelectDate(date) {
    setSelectedDate(date);
    setSelectedTime(null); // availability differs per day — clear a stale pick
  }

  // Derived: booking is blocked when a pending appointment exists (except
  // when the user arrived via Reschedule — they are editing that appointment).
  const isBookingBlocked = !isReschedule && hasPending;

  // The old appointment being replaced, for reschedule mode — needed so we
  // can cancel it if the backend refuses the new one as a duplicate pending.
  const oldAppointmentId = appointmentIdParam || rescheduleSource?.id;

  async function handleBook() {
    if (isBookingBlocked) {
      setBookingError(
        "You already have an active appointment (pending). Please wait until it is completed or cancelled before booking again."
      );
      return;
    }
    if (!canStartBooking(booking, bookingInFlightRef.current)) return;

    setBookingError("");
    setBooking(true);
    bookingInFlightRef.current = true;

    const matchedSlot = slots.find((s) => s.time === selectedTime);
    const matchedReason = findReason(reasonList, reasonId);
    const createBody = buildAppointmentPayload({
      studentId,
      slot: matchedSlot,
      reason: matchedReason,
      selectedDate,
      rescheduledId: isReschedule ? oldAppointmentId : null,
    });

    try {
      const created = await appointmentsApi.create(createBody);
      finishBooking(created);
    } catch (err) {
      const msg = err?.message || "Couldn't book the appointment. Please try again.";
      console.error("Booking failed:", err);
      setBookingError(msg);
      if (/already have an active appointment/i.test(msg)) {
        setHasPending(true);
      }
    } finally {
      bookingInFlightRef.current = false;
      setBooking(false);
    }

    function finishBooking(created) {
      const payload = {
        id: created?.appointment_id ?? created?.id ?? oldAppointmentId,
        date: selectedDate,
        time: selectedTime,
        reason: matchedReason?.description || "",
      };
      if (isReschedule) {
        rescheduleAppointment(payload);
      } else {
        bookAppointment(payload);
      }
      setBooked(true);
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

  const pageTitle = wantsReschedule ? "Reschedule Appointment" : "Book an Appointment";
  const summaryActionLabel = wantsReschedule ? "Confirm Reschedule" : "Book";
  const summaryLoadingLabel = wantsReschedule ? "Rescheduling…" : "Booking…";

  const selection = { reasonId, date: selectedDate, time: selectedTime };
  const summary = summarizeSelection({
    reasons: reasonList,
    reasonId,
    date: selectedDate,
    time: selectedTime,
  });
  const summaryReady = canProceed(4, selection);
  const confirmReady = canProceed(5, selection);
  // "idle" means nothing has been requested yet — the time panel only ever
  // renders once a reason and a date exist, so that instant is a load in
  // flight rather than an empty schedule.
  const timeStatus = slotsStatus === "idle" ? "loading" : slotsStatus;
  const calendarCaption = availableDates
    ? "Only dates scheduled for this service are bookable."
    : "Booking is available starting tomorrow";
  const summaryDisabled = isBookingBlocked || pendingCheckStatus === "loading";
  const summaryDisabledReason = isBookingBlocked
    ? "You already have an active appointment (pending)."
    : undefined;

  return (
    <div className="pt-2 md:pt-6">
      <h1 className="mb-5 hidden text-2xl font-semibold text-ink-900 md:block">
        {pageTitle}
      </h1>

      {/* Active-appointment guard + backend error banner */}
      {isBookingBlocked && (
        <div
          role="alert"
          className="mb-4 rounded-card border border-signal-amber-ring bg-signal-amber-bg px-4 py-3 text-sm text-signal-amber animate-fade-in-up motion-reduce:animate-none"
        >
          <p className="font-semibold">You already have an active appointment (pending).</p>
          <p className="mt-1">Please wait until it is completed or cancelled before booking again.</p>
          <Link to="/student/dashboard" className="mt-2 inline-block font-semibold underline underline-offset-2 transition-opacity hover:opacity-75">
            View upcoming appointment
          </Link>
        </div>
      )}
      {bookingError && (
        <div role="alert" className="mb-4 rounded-card border border-signal-rose-ring bg-signal-rose-bg px-4 py-3 text-sm text-signal-rose animate-fade-in-up motion-reduce:animate-none">
          {bookingError}
        </div>
      )}
      {pendingCheckStatus === "loading" && !isReschedule && (
        <p className="mb-4 text-xs text-ink-400 animate-fade-in">Checking existing appointments…</p>
      )}

      {/* ---------- Mobile: one step at a time (Reason -> Calendar ->
          Time Slot -> Summary -> Confirm) ---------- */}
      <div className="md:hidden max-w-sm mx-auto">
        <p className="mb-3 text-center text-lg font-semibold text-ink-900">{pageTitle}</p>
        <BookingStepIndicator step={step} onStepClick={setStep} />

        {/* key={step} remounts this wrapper on every mobile step change so
            each step replays a quick settle-in transition — transform/opacity
            only, so it stays cheap. */}
        <div key={step} className="animate-fade-in-up motion-reduce:animate-none">
        {step === 1 && (
          <div className="space-y-4">
            <SelectReasonPanel
              reasons={reasonList}
              reasonId={reasonId}
              onSelectReason={handleSelectReason}
            />
            <button
              type="button"
              disabled={!canProceed(1, selection)}
              onClick={() => setStep(2)}
              className={stepButtonClass(canProceed(1, selection))}
            >
              Next: Calendar
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SelectDateCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              navigationMode="month"
              minDate={tomorrow}
              availableDates={availableDates}
            />
            <p className="text-center text-xs text-ink-500">{calendarCaption}</p>
            <button
              type="button"
              disabled={!canProceed(2, selection)}
              onClick={() => setStep(3)}
              className={stepButtonClass(canProceed(2, selection))}
            >
              Next: Time Slot
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <SelectTimeSlots
              slots={slots}
              selectedTime={selectedTime}
              onSelectTime={setSelectedTime}
              status={timeStatus}
            />
            <button
              type="button"
              disabled={!canProceed(3, selection)}
              onClick={() => setStep(4)}
              className={stepButtonClass(canProceed(3, selection))}
            >
              Next: Summary
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <SummaryPanel date={selectedDate} time={selectedTime} reason={summary.reasonLabel} />
            <button
              type="button"
              disabled={!summaryReady}
              onClick={() => setStep(5)}
              className={stepButtonClass(summaryReady)}
            >
              Next: Confirm
            </button>
          </div>
        )}

        {step === 5 && (
          <AppointmentSummaryCard
            date={selectedDate}
            time={selectedTime}
            reason={summary.reasonLabel}
            booking={booking}
            onBook={handleBook}
            actionLabel={summaryActionLabel}
            loadingLabel={summaryLoadingLabel}
            disabled={summaryDisabled}
            disabledReason={summaryDisabledReason}
          />
        )}
        </div>
      </div>

      {/* ---------- Desktop: same order, later panels gated until their
          prerequisite exists ---------- */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 md:gap-5 md:items-start">
        <SelectReasonPanel
          reasons={reasonList}
          reasonId={reasonId}
          onSelectReason={handleSelectReason}
        />

        {reasonReady ? (
          <div>
            <SelectDateCalendar
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              navigationMode="month"
              minDate={tomorrow}
              availableDates={availableDates}
            />
            <p className="text-center text-xs text-ink-500 mt-2">{calendarCaption}</p>
          </div>
        ) : (
          <GatedPanel
            title="Select Date"
            message="Choose a reason first to see the available dates."
          />
        )}

        {reasonReady && selectedDate ? (
          <SelectTimeSlots
            slots={slots}
            selectedTime={selectedTime}
            onSelectTime={setSelectedTime}
            status={timeStatus}
          />
        ) : (
          <GatedPanel
            title="Select Time"
            message="Choose a reason and a date first to see the available times."
          />
        )}

        {summaryReady ? (
          <SummaryPanel date={selectedDate} time={selectedTime} reason={summary.reasonLabel} />
        ) : (
          <GatedPanel
            title="Appointment summary"
            message="Choose a reason, date and time to see your summary."
          />
        )}

        {confirmReady ? (
          <AppointmentSummaryCard
            date={selectedDate}
            time={selectedTime}
            reason={summary.reasonLabel}
            booking={booking}
            onBook={handleBook}
            actionLabel={summaryActionLabel}
            loadingLabel={summaryLoadingLabel}
            disabled={summaryDisabled}
            disabledReason={summaryDisabledReason}
          />
        ) : (
          <GatedPanel
            title="Confirm booking"
            message="Choose a reason, date and time to confirm your appointment."
          />
        )}
      </div>
    </div>
  );
}
