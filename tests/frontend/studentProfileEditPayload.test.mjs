import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSafeProfilePatch } from '../../src/lib/studentProfileEditPayload.js'

const PAYLOAD = {
  first_name: 'Juan',
  emergency_contact: { contact_name: 'Maria' },
  medical_history: { has_asthma: true },
}

test('buildSafeProfilePatch preserves medical sections when summary is loaded', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true), PAYLOAD)
})

test('buildSafeProfilePatch omits medical sections when summary is unavailable', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false), {
    first_name: 'Juan',
  })
})

test('buildSafeProfilePatch adds consent only when explicitly requested', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, false), PAYLOAD)
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, false), {
    first_name: 'Juan',
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, true), {
    ...PAYLOAD,
    data_privacy_consent: true,
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, true), {
    first_name: 'Juan',
    data_privacy_consent: true,
  })
})
