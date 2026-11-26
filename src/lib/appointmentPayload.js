import { toYMD } from './calendar.js'

export function buildAppointmentPayload({
  studentId,
  slot,
  reason,
  selectedDate,
  rescheduledId = null,
}) {
  const payload = {
    student_id: studentId,
    slot_id: slot?.id ?? null,
    appointment_date: toYMD(selectedDate),
    appointment_time: slot?.slot_start || '08:00',
    reason_id: reason?.reason_id,
    purpose: reason?.description || '',
  }

  if (rescheduledId !== null && rescheduledId !== undefined && rescheduledId !== '') {
    payload.rescheduled_id = rescheduledId
  }

  return payload
}

export function canStartBooking(submitting, inFlight) {
  return !submitting && !inFlight
}
