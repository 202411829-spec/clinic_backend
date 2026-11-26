import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveApiBaseUrl,
  shouldPrefixApi,
  toApiUrl,
} from '../../src/lib/api.js'

test('separate production backend URLs are not given the Vercel /api prefix', () => {
  const origin = 'https://gccas.vercel.app'
  const baseUrl = 'https://gc-rfb-backend-production.up.railway.app'

  assert.equal(shouldPrefixApi(baseUrl, origin), false)
  assert.equal(
    toApiUrl('/logbook', { origin, baseUrl }),
    'https://gc-rfb-backend-production.up.railway.app/logbook'
  )
})

test('same-origin Vercel Flask mount still receives the /api prefix', () => {
  const origin = 'https://gccas.vercel.app'

  assert.equal(shouldPrefixApi('/', origin), true)
  assert.equal(shouldPrefixApi(origin, origin), true)
  assert.equal(
    toApiUrl('/logbook', { origin, baseUrl: origin }),
    'https://gccas.vercel.app/api/logbook'
  )
})

test('relative VITE_API_URL resolves against the current origin before URL construction', () => {
  const origin = 'https://gccas.vercel.app'

  assert.equal(resolveApiBaseUrl('/', origin), `${origin}/`)
  assert.equal(
    toApiUrl('/logbook', { origin, baseUrl: '/' }),
    'https://gccas.vercel.app/api/logbook'
  )
  assert.equal(
    toApiUrl('/appointments/slots', { origin, baseUrl: '/' }),
    'https://gccas.vercel.app/api/appointments/slots'
  )
  assert.equal(
    toApiUrl('/reasons', { origin, baseUrl: '/' }),
    'https://gccas.vercel.app/api/reasons'
  )
  assert.equal(
    toApiUrl('/api/masterlist/departments', { origin, baseUrl: '/' }),
    'https://gccas.vercel.app/api/masterlist/departments'
  )
})

test('local dev backend keeps root-relative paths without a /api prefix', () => {
  const baseUrl = 'http://127.0.0.1:5000'

  assert.equal(
    shouldPrefixApi(baseUrl, 'http://localhost:5173'),
    false
  )
  assert.equal(
    toApiUrl('/logbook', { origin: 'http://localhost:5173', baseUrl }),
    'http://127.0.0.1:5000/logbook'
  )
})
