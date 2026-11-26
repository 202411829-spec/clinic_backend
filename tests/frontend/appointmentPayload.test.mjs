import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAppointmentPayload,
  canStartBooking,
} from '../../src/lib/appointmentPayload.js'

test('buildAppointmentPayload includes rescheduled_id when replacing an appointment', () => {
  const payload = buildAppointmentPayload({
    studentId: '202311330',
    slot: { id: 5, slot_start: '10:00' },
    reason: { reason_id: 7, description: 'Consultation' },
    selectedDate: new Date('2026-11-24T00:00:00'),
    rescheduledId: 10,
  })

  assert.deepEqual(payload, {
    student_id: '202311330',
    slot_id: 5,
    appointment_date: '2026-11-24',
    appointment_time: '10:00',
    reason_id: 7,
    purpose: 'Consultation',
    rescheduled_id: 10,
  })
})

test('buildAppointmentPayload omits rescheduled_id for normal booking', () => {
  const payload = buildAppointmentPayload({
    studentId: '202311330',
    slot: { id: 6, slot_start: '11:00' },
    reason: { reason_id: 8, description: 'Checkup' },
    selectedDate: new Date('2026-11-25T00:00:00'),
    rescheduledId: null,
  })

  assert.equal('rescheduled_id' in payload, false)
  assert.equal(payload.appointment_time, '11:00')
})

test('canStartBooking blocks a second submit while one is in flight', () => {
  assert.equal(canStartBooking(false, false), true)
  assert.equal(canStartBooking(true, false), false)
  assert.equal(canStartBooking(false, true), false)
})
