import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTime12Hour,
  formatTimeRange,
} from '../../src/lib/timeFormat.js'

test('formatTime12Hour converts morning, noon, afternoon, and evening times', () => {
  const cases = [
    ['07:00', '7:00 AM'],
    ['12:00', '12:00 PM'],
    ['13:00', '1:00 PM'],
    ['17:30:00', '5:30 PM'],
    ['00:00', '12:00 AM'],
  ]

  for (const [input, expected] of cases) {
    assert.equal(formatTime12Hour(input), expected, input)
  }
})

test('formatTime12Hour is idempotent for already formatted times', () => {
  assert.equal(formatTime12Hour('7:00 AM'), '7:00 AM')
  assert.equal(formatTime12Hour('12:00 PM'), '12:00 PM')
})

test('formatTime12Hour returns an empty string for empty or unknown times', () => {
  assert.equal(formatTime12Hour(''), '')
  assert.equal(formatTime12Hour(null), '')
  assert.equal(formatTime12Hour('TBA'), '')
})

test('formatTimeRange converts 24-hour ranges and uses en dash', () => {
  const cases = [
    ['07:00 - 08:00', '7:00 AM – 8:00 AM'],
    ['17:00 - 17:30', '5:00 PM – 5:30 PM'],
    ['09:00 – 17:00', '9:00 AM – 5:00 PM'],
  ]

  for (const [input, expected] of cases) {
    assert.equal(formatTimeRange(input), expected, input)
  }
})

test('formatTimeRange converts ranges that cross from AM to PM', () => {
  assert.equal(formatTimeRange('11:30 - 12:00'), '11:30 AM – 12:00 PM')
  assert.equal(formatTimeRange('11:30 AM - 12:00 PM'), '11:30 AM – 12:00 PM')
})

test('formatTimeRange formats a single time and preserves unknown text', () => {
  assert.equal(formatTimeRange('13:00'), '1:00 PM')
  assert.equal(formatTimeRange(''), '')
  assert.equal(formatTimeRange('TBA'), 'TBA')
})
