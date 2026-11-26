// Admin Appointments reads the same slots endpoint as the student flow, but
// that endpoint scopes an unqualified date request to the legacy General
// schedule. Reasons with dedicated schedules (e.g. Dental Service) live on
// separate schedule rows, so the admin feed must request those scopes too and
// merge the results before filtering/rendering.

import { appointmentsApi, referenceApi } from './api.js'
import { normalizeReasonId, reasonUsesDedicatedSchedule } from './bookingFlow.js'

function bookingKey(booking) {
  if (booking?.appointment_id !== undefined && booking?.appointment_id !== null) {
    return booking.appointment_id
  }
  if (booking?.id !== undefined && booking?.id !== null) return booking.id
  return JSON.stringify(booking ?? {})
}

function slotKey(slot) {
  if (slot?.slot_id !== undefined && slot?.slot_id !== null) return slot.slot_id
  if (slot?.id !== undefined && slot?.id !== null) return slot.id
  return `${slot?.schedule_id ?? 'virtual'}:${slot?.time ?? slot?.slot_start ?? ''}`
}

/**
 * Merge General and reason-scoped slot groups without losing a booking.
 * Distinct schedule ids remain distinct blocks even when the time matches,
 * because each schedule owns its own capacity. Duplicate booking ids are
 * collapsed so a reason can never appear twice if two feeds overlap.
 */
export function mergeAppointmentSlots(...groups) {
  const byKey = new Map()

  for (const slot of groups.flat()) {
    if (!slot) continue
    const key = slotKey(slot)
    const current = byKey.get(key)

    if (!current) {
      const bookings = [...(slot.bookings || [])]
      const capacity = Number(slot.capacity ?? 0)
      const booked = bookings.length
      byKey.set(key, {
        ...slot,
        bookings,
        booked,
        slotsLeft: Math.max(0, capacity - booked),
        full: booked >= capacity,
        available: booked < capacity,
      })
      continue
    }

    const seen = new Set((current.bookings || []).map(bookingKey))
    const extra = (slot.bookings || []).filter((booking) => {
      const key = bookingKey(booking)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const bookings = [...(current.bookings || []), ...extra]
    const capacity = Number(slot.capacity ?? current.capacity ?? 0)
    const booked = bookings.length

    byKey.set(key, {
      ...current,
      ...slot,
      bookings,
      booked,
      capacity,
      slotsLeft: Math.max(0, capacity - booked),
      full: booked >= capacity,
      available: booked < capacity,
    })
  }

  return Array.from(byKey.values()).sort((a, b) =>
    String(a.slot_start || '').localeCompare(String(b.slot_start || ''))
  )
}

async function resolveReasonRecords(reasonRecords) {
  if (Array.isArray(reasonRecords) && reasonRecords.length) return reasonRecords
  try {
    const response = await referenceApi.reasons()
    return response?.reasons || []
  } catch {
    // Never hide the General feed just because reference data failed to load.
    return []
  }
}

/**
 * Fetch every slot group Admin Appointments is responsible for showing:
 * the legacy General feed plus one feed per dedicated reason.
 */
export async function fetchAdminAppointmentSlots(date, reasonRecords) {
  const [generalResponse, reasons] = await Promise.all([
    appointmentsApi.slots(date),
    resolveReasonRecords(reasonRecords),
  ])

  const dedicatedIds = Array.from(
    new Set(
      reasons
        .filter(reasonUsesDedicatedSchedule)
        .map((reason) => normalizeReasonId(reason?.reason_id))
        .filter((id) => id !== '')
    )
  )

  const scopedResponses = await Promise.all(
    dedicatedIds.map((reasonId) => appointmentsApi.slots(date, reasonId))
  )

  return mergeAppointmentSlots(
    generalResponse?.slots || [],
    ...scopedResponses.map((response) => response?.slots || [])
  )
}
