// src/lib/bookingFlow.js
// Pure helpers for the student booking flow: step order, reason
// normalization, selection clearing, availability-date derivation, summary
// lookup and step gating. No React and no network here, so the flow's rules
// can be unit-tested without rendering anything.
import { startOfDay, toYMD } from './calendar.js'

/**
 * Booking step order — the reason is chosen first so every later choice
 * (date, time) can be scoped to it. The mobile indicator and the desktop
 * panel order both follow this list.
 */
export const BOOKING_STEPS = [
  { n: 1, key: 'reason', label: 'Reason' },
  { n: 2, key: 'calendar', label: 'Calendar' },
  { n: 3, key: 'time', label: 'Time Slot' },
  { n: 4, key: 'summary', label: 'Summary' },
  { n: 5, key: 'confirm', label: 'Confirm' },
]

export const FIRST_STEP = BOOKING_STEPS[0].n
export const LAST_STEP = BOOKING_STEPS[BOOKING_STEPS.length - 1].n

/**
 * What must already be picked before the student may continue past a step.
 * Later steps repeat the earlier requirements so a stale/incomplete
 * selection can never skip ahead.
 */
export const STEP_REQUIREMENTS = {
  1: ['reasonId'],
  2: ['reasonId', 'date'],
  3: ['reasonId', 'date', 'time'],
  4: ['reasonId', 'date', 'time'],
  5: ['reasonId', 'date', 'time'],
}

/** Reason ids arrive as numbers, numeric strings or '' — one normal form. */
export function normalizeReasonId(value) {
  if (value === null || value === undefined) return ''
  const id = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isInteger(id) && id > 0 ? id : ''
}

export function isReasonSelected(reasonId) {
  return normalizeReasonId(reasonId) !== ''
}

/** Look a reason up by id in the /reasons payload; null when unknown. */
export function findReason(reasons, reasonId) {
  const id = normalizeReasonId(reasonId)
  if (id === '') return null
  return (reasons || []).find((r) => normalizeReasonId(r.reason_id) === id) ?? null
}

/** Human label for the summary/confirm cards. */
export function reasonDescription(reasons, reasonId) {
  return findReason(reasons, reasonId)?.description || ''
}

/**
 * Reasons whose schedules are reason-scoped by product rule. The backend flag
 * is authoritative when present; the description fallback covers partially
 * migrated environments where that flag is absent.
 */
export const DEDICATED_REASON_DESCRIPTIONS = ['dental service']

export function reasonUsesDedicatedSchedule(reason) {
  if (!reason || typeof reason !== 'object') return false
  if (reason.uses_dedicated_schedule === true) return true
  const description = String(reason.description || '').trim().toLowerCase()
  return DEDICATED_REASON_DESCRIPTIONS.includes(description)
}

/** A dedicated reason (e.g. Dental Service) has its own schedule only. */
export function isDedicatedReason(reasons, reasonId) {
  return reasonUsesDedicatedSchedule(findReason(reasons, reasonId))
}

/**
 * State reset applied whenever the student picks a different reason: the
 * date, time, loaded slots and calendar availability all belonged to the
 * previous reason, so they are dropped together and the flow restarts at
 * step 1.
 */
export function clearOnReasonChange() {
  return {
    selectedDate: null,
    selectedTime: null,
    slots: [],
    slotsStatus: 'idle',
    availableDates: null,
  }
}

/**
 * Which dates the calendar may offer for a given reason.
 *
 *   non-dedicated (or no reason yet) -> { restricted: false, dates: null }
 *     no restriction: keep the legacy "tomorrow onward" availability.
 *   dedicated -> { restricted: true, dates: ['YYYY-MM-DD', ...] }
 *     only that reason's enabled schedule dates are selectable; an empty
 *     array means nothing is selectable — never a fallback to the general
 *     schedule.
 *
 * schedule: rows from GET /clinic-schedule (reason-scoped by the caller).
 * minDate: earliest bookable day (bookings start tomorrow).
 */
export function availabilityDates({ reason, schedule, minDate = null } = {}) {
  if (!reasonUsesDedicatedSchedule(reason)) {
    return { restricted: false, dates: null }
  }

  const min = minDate ? toYMD(startOfDay(minDate)) : null
  const rows = Array.isArray(schedule) ? schedule : []
  const dates = []

  for (const row of rows) {
    if (!row || row.is_enabled === false) continue
    const ymd = row?.working_date ? String(row.working_date).slice(0, 10) : ''
    if (!ymd) continue
    if (min && ymd < min) continue
    if (!dates.includes(ymd)) dates.push(ymd)
  }

  dates.sort()
  return { restricted: true, dates }
}

/** May the student leave this step (and therefore see the next panel)? */
export function canProceed(step, { reasonId, date, time } = {}) {
  const required = STEP_REQUIREMENTS[Number(step)]
  if (!required) return false

  const values = { reasonId, date, time }
  return required.every((field) => {
    const value = values[field]
    if (field === 'reasonId') return isReasonSelected(value)
    return Boolean(value)
  })
}

/** Read-only recap of the current choices for the Summary/Confirm cards. */
export function summarizeSelection({ reasons = [], reasonId, date, time } = {}) {
  return {
    reasonId: normalizeReasonId(reasonId),
    reasonLabel: reasonDescription(reasons, reasonId),
    date: date ?? null,
    time: time ?? null,
  }
}
