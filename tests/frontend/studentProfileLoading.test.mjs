import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createStudentProfileLoader,
  createMedicalSummaryLoader,
} from '../../src/lib/studentProfileLoading.js'

const PROFILE = { student_id: '202311330', first_name: 'Juan' }
const SUMMARY = {
  profile: PROFILE,
  emergency_contact: { contact_name: 'Maria' },
  medical_history: {},
  years: {},
}

test('createStudentProfileLoader reuses one in-flight profile request for duplicate loads', async () => {
  let calls = 0
  let resolveRequest
  const request = (studentId, opts) => {
    calls += 1
    assert.equal(studentId, '202311330')
    assert.ok(opts?.signal instanceof AbortSignal)
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  }

  const loader = createStudentProfileLoader(request)
  const first = loader.load('202311330')
  const second = loader.load('202311330')

  resolveRequest(PROFILE)
  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(calls, 1)
  assert.deepEqual(firstResult, PROFILE)
  assert.deepEqual(secondResult, PROFILE)
})

test('createStudentProfileLoader reports timeout so profile loading cannot hang', async () => {
  const request = (_studentId, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })

  const loader = createStudentProfileLoader(request, { timeoutMs: 20 })

  await assert.rejects(loader.load('202311330'), /timed out/i)
})

test('createStudentProfileLoader times out a request that ignores AbortSignal', async () => {
  const loader = createStudentProfileLoader(() => new Promise(() => {}), { timeoutMs: 20 })

  await assert.rejects(loader.load('202311330'), /timed out/i)
})

test('createMedicalSummaryLoader shares one in-flight request between callers', async () => {
  let calls = 0
  let resolveRequest
  const request = () => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  }

  const loader = createMedicalSummaryLoader(request)
  const first = loader.load('202311330')
  const second = loader.load('202311330')

  resolveRequest(SUMMARY)
  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(calls, 1)
  assert.deepEqual(firstResult, { summary: SUMMARY, source: 'network' })
  assert.deepEqual(secondResult, { summary: SUMMARY, source: 'network' })
})

test('createMedicalSummaryLoader reuses cached summary without a second request', async () => {
  let calls = 0
  const request = () => {
    calls += 1
    return Promise.resolve(SUMMARY)
  }

  const loader = createMedicalSummaryLoader(request)
  await loader.load('202311330')
  const cached = await loader.load('202311330')

  assert.equal(calls, 1)
  assert.deepEqual(cached, { summary: SUMMARY, source: 'cache' })
})

test('createMedicalSummaryLoader uses a cached summary set by the owner', async () => {
  let calls = 0
  const request = () => {
    calls += 1
    return Promise.resolve(SUMMARY)
  }

  const loader = createMedicalSummaryLoader(request)
  loader.setCached('202311330', SUMMARY)
  const result = await loader.load('202311330')

  assert.equal(calls, 0)
  assert.deepEqual(result, { summary: SUMMARY, source: 'cache' })
})

test('createMedicalSummaryLoader retries after a failed request', async () => {
  let calls = 0
  const request = () => {
    calls += 1
    if (calls === 1) return Promise.reject(new Error('network down'))
    return Promise.resolve(SUMMARY)
  }

  const loader = createMedicalSummaryLoader(request)

  await assert.rejects(loader.load('202311330'), /network down/)
  const retried = await loader.load('202311330')

  assert.equal(calls, 2)
  assert.deepEqual(retried.summary, SUMMARY)
})
