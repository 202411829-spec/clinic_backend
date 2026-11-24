const DEFAULT_TIMEOUT_MS = 12000

function requestWithTimeout(request, studentId, timeoutMs, timeoutMessage) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
      queueMicrotask(() => controller.abort())
    }, timeoutMs)
  })

  let pending
  try {
    pending = Promise.resolve(request(studentId, { signal: controller.signal }))
  } catch (error) {
    clearTimeout(timer)
    return Promise.reject(error)
  }

  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer))
}

export function createStudentProfileLoader(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const inFlight = new Map()

  function load(studentId) {
    if (!studentId) return Promise.reject(new Error("Student account unavailable"))
    if (inFlight.has(studentId)) return inFlight.get(studentId)

    const promise = requestWithTimeout(
      request,
      studentId,
      timeoutMs,
      "Profile request timed out"
    ).finally(() => {
      if (inFlight.get(studentId) === promise) inFlight.delete(studentId)
    })

    inFlight.set(studentId, promise)
    return promise
  }

  return { load }
}

export function createMedicalSummaryLoader(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const inFlight = new Map()
  const cached = new Map()

  function load(studentId) {
    if (!studentId) return Promise.reject(new Error("Student account unavailable"))
    if (cached.has(studentId)) {
      return Promise.resolve({ summary: cached.get(studentId), source: "cache" })
    }
    if (inFlight.has(studentId)) return inFlight.get(studentId)

    const promise = requestWithTimeout(
      request,
      studentId,
      timeoutMs,
      "Medical details request timed out"
    )
      .then((summary) => {
        cached.set(studentId, summary)
        return { summary, source: "network" }
      })
      .finally(() => {
        if (inFlight.get(studentId) === promise) inFlight.delete(studentId)
      })

    inFlight.set(studentId, promise)
    return promise
  }

  function setCached(studentId, summary) {
    if (studentId && summary) cached.set(studentId, summary)
  }

  return { load, setCached }
}
