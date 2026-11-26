import { supabase } from './supabaseClient.js'
import { appendRequestParams } from './requestParams.js'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:5000'
const API_BASE_URL = import.meta.env?.VITE_API_URL || DEFAULT_API_BASE_URL

function currentOrigin() {
  return typeof window === 'undefined' ? null : window.location?.origin || null
}

// A relative VITE_API_URL (e.g. `/` on Vercel) is not a valid base for `new
// URL()`. Resolve it against the current browser origin first so the same
// source works locally (absolute Flask host by default) and on Vercel
// (same-origin Flask mount).
export function resolveApiBaseUrl(baseUrl = API_BASE_URL, origin = currentOrigin()) {
  const value = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : DEFAULT_API_BASE_URL
  try {
    return new URL(value, origin || undefined).toString()
  } catch {
    return value
  }
}

// ---- Backend URL normalizer (two modes, one place) ----
// Same-origin backend (local Flask proxy or Flask mounted in a Vercel
// serverless function): root-level Flask routes must be reached through `/api`.
// Separate backend host (Railway/Render/etc.): Flask is already reachable at
// its own root, so paths are used verbatim. Paths that already carry `/api`
// (`/api/reports/`, `/api/masterlist/students`, `/api/auth/*`) are never
// double-prefixed. Working on the parsed URL keeps query strings intact.
export function shouldPrefixApi(baseUrl, origin) {
  try {
    if (!origin) return false
    const base = new URL(baseUrl, origin)
    return base.origin === new URL(origin).origin
  } catch {
    return false
  }
}

export function toApiUrl(path, { origin = currentOrigin(), baseUrl = API_BASE_URL } = {}) {
  const resolvedBaseUrl = resolveApiBaseUrl(baseUrl, origin)
  const url = new URL(path, resolvedBaseUrl)
  const alreadyPrefixed = url.pathname === '/api' || url.pathname.startsWith('/api/')
  if (!alreadyPrefixed && shouldPrefixApi(resolvedBaseUrl, origin)) {
    url.pathname = `/api${url.pathname}`
  }
  return url.toString()
}

// The Flask backend rejects every API call (except GET / and /health)
// without "Authorization: Bearer <supabase_access_token>".
async function getAccessToken() {
  try {
    const { data } = (await supabase?.auth.getSession()) ?? {}
    const session = data?.session
    if (!session?.access_token) return null

    // Supabase can hand back a token that is already close to expiration
    // (e.g. after the tab slept). Refresh it before sending it to Flask so a
    // live session does not turn into a spurious 401 on dashboard/profile.
    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 10_000) {
      const { data: refreshed, error } = await refreshSessionOnce()
      if (error || !refreshed?.session?.access_token) return null
      return refreshed.session.access_token
    }

    return session.access_token
  } catch {
    // No usable session yet — send the request unauthenticated and let the
    // backend's 401 handling below route the user back to login.
    return null
  }
}

function redirectToLogin() {
  const isAdminArea = window.location.pathname.startsWith('/admin')
  window.location.replace(isAdminArea ? '/admin/login' : '/student/login')
}

// Guards against a pile of parallel 401s (e.g. a page firing several
// requests at once after the tab wakes up) each kicking off their own
// refresh — every caller awaits the same in-flight refresh instead.
let refreshInFlight = null

function refreshSessionOnce() {
  if (!refreshInFlight) {
    refreshInFlight = (supabase?.auth.refreshSession() ?? Promise.resolve({ data: null, error: new Error('no client') }))
      .finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

// ---- Lightweight client-side GET cache ----
// Map keyed by `${method} ${url}` -> { data, expiresAt }
const apiCache = new Map()

// Per-route TTL registry (ms). Only GETs are cached.
// Registry suggestion from spec:
//   masterlist search/page (30s), departments/years (5min),
//   reports date queries (5min), clinic settings (5min).
const CACHE_REGISTRY = [
  { test: (p) => p.startsWith('/api/masterlist/students'), ttl: 30_000 },
  { test: (p) => p === '/api/masterlist/departments', ttl: 300_000 },
  { test: (p) => p === '/api/masterlist/years', ttl: 300_000 },
  { test: (p) => p.startsWith('/api/masterlist/courses'), ttl: 300_000 },
  { test: (p) => p.startsWith('/api/reports'), ttl: 300_000 },
  { test: (p) => p === '/clinic-settings', ttl: 300_000 },
]

function resolveCacheTtl(path, explicit) {
  if (explicit != null) return explicit
  for (const entry of CACHE_REGISTRY) {
    if (entry.test(path)) return entry.ttl
  }
  return null
}

export function clearApiCache() {
  apiCache.clear()
}

async function request(path, { params, headers, cacheTtl: explicitCacheTtl, signal, ...options } = {}, _retried = false) {
  const url = new URL(toApiUrl(path))
  appendRequestParams(url.searchParams, params)

  const method = (options.method || 'GET').toUpperCase()
  const effectiveTtl = method === 'GET' ? resolveCacheTtl(path, explicitCacheTtl) : null
  const cacheKey = `${method} ${url.toString()}`

  if (effectiveTtl && method === 'GET' && !_retried) {
    const cached = apiCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data
    }
    if (cached) apiCache.delete(cacheKey)
  }

  const accessToken = await getAccessToken()

  const response = await fetch(url, {
    ...options,
    ...(signal ? { signal } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })

  if (response.status === 401) {
    // A 401 doesn't always mean the session is truly over — the access
    // token can go stale on its own (e.g. the browser throttles Supabase's
    // background refresh timer while a tab is backgrounded or the device
    // sleeps), even though the refresh token is still perfectly valid.
    // Try one silent refresh + retry before treating this as a real
    // logout; only bounce to the login screen if the refresh itself
    // fails, or if this request has already been retried once.
    if (!_retried) {
      try {
        const { data, error } = await refreshSessionOnce()
        if (!error && data?.session) {
          return request(path, { params, headers, ...options }, true)
        }
      } catch {
        // fall through to sign-out below
      }
    }

    clearApiCache()
    await supabase?.auth.signOut().catch(() => {})
    redirectToLogin()
    throw new Error('Your session has expired. Please sign in again.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || body?.detail || `Request failed (${response.status})`)
  }

  if (response.status === 204) return null
  const data = await response.json()
  if (effectiveTtl && method === 'GET' && response.ok) {
    apiCache.set(cacheKey, { data, expiresAt: Date.now() + effectiveTtl })
  }
  return data
}

export const api = {
  get: (path, params, opts = {}) => request(path, { params, ...opts }),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body: JSON.stringify(body), ...opts }),
  put: (path, body, opts = {}) => request(path, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  patch: (path, body, opts = {}) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  del: (path, opts = {}) => request(path, { method: 'DELETE', ...opts }),
}

// ---- Student Masterlist ----
// Backend now wraps these in {success:true, data:...} (see routers/masterlist.py:83/118/139/155).
// Unwrap here so callers (Masterlist.jsx, StudentRecord.jsx, studentAdapter, etc.) keep
// receiving bare arrays/objects and don't hit `departments.map is not a function`.
// `listStudents` keeps the pagination envelope {data,total,page,page_size} intact.
function unwrapData(envelope) {
  if (envelope && typeof envelope === 'object' && 'data' in envelope && 'success' in envelope) return envelope.data
  return envelope
}
export const masterlistApi = {
  listStudents: (params, opts) => api.get('/api/masterlist/students', params, opts),
  getStudent: (studentId, opts) => api.get(`/api/masterlist/students/${studentId}`, undefined, opts).then(unwrapData),
  listDepartments: (opts) => api.get('/api/masterlist/departments', undefined, opts).then(unwrapData),
  listCourses: (departmentId, opts) => api.get('/api/masterlist/courses', { department_id: departmentId }, opts).then(unwrapData),
  listYears: (opts) => api.get('/api/masterlist/years', undefined, opts).then(unwrapData),
}

// ---- Dashboard ----
export const dashboardApi = {
  get: () => api.get('/dashboard'),
}

// ---- Appointments ----
// GET /appointments/slots?date=YYYY-MM-DD returns slots shaped as:
// {id, slot_id, schedule_id, time, slot_start, slot_end, capacity,
//  booked, slotsLeft, full, available, bookings:[{id, appointment_id,
//  student_id, name, age, dept, sex, reason, status, bookedAt}]}
export const appointmentsApi = {
  list: (params, opts) => api.get('/appointments', params, opts),
  get: (appointmentId, opts) => api.get(`/appointments/${appointmentId}`, undefined, opts),
  create: (body, opts) => api.post('/appointments', body, opts),
  // `reasonId` scopes availability to that reason's own schedule (e.g.
  // Dental Service). It is only sent when a reason is actually selected —
  // omitting it keeps the legacy general-availability behavior.
  slots: (date, reasonId, opts) =>
    api.get(
      '/appointments/slots',
      reasonId === undefined || reasonId === null || reasonId === ''
        ? { date }
        : { date, reason_id: reasonId },
      opts
    ),
  getStatus: (appointmentId, opts) => api.get(`/appointments/${appointmentId}/status`, undefined, opts),
  updateStatus: (appointmentId, body, opts) =>
    api.patch(`/appointments/${appointmentId}/status`, body, opts),
  delete: (appointmentId, opts) => api.del(`/appointments/${appointmentId}`, opts),
  // Persisted admin time-block deletion. The body carries the date/time scope
  // needed for virtual slots that have no time_slots row yet.
  deleteTimeSlot: (slotId, body, opts) =>
    api.del(`/appointments/time-slots/${slotId}`, {
      body: JSON.stringify(body),
      ...opts,
    }),
}

// ---- Logbook ----
export const logbookApi = {
  list: (params = {}, opts) => api.get('/logbook', params, opts),
  byStudent: (studentId, opts) => api.get(`/logbook/student/${studentId}`, undefined, opts),
  createWalkIn: (body, opts) => api.post('/logbook/walk-in', body, opts),
  addMedicine: (logId, medicines, opts) => api.post(`/logbook/${logId}/medicine`, { medicines }, opts),
}

// Reference tables used by the walk-in / booking forms.
export const referenceApi = {
  reasons: (opts) => api.get('/reasons', undefined, opts),
  medicines: (opts) => api.get('/medicines', undefined, opts),
}

// ---- Notifications (status-change history per student) ----
export const notificationsApi = {
  list: (studentId) => api.get(`/notifications/${studentId}`),
}

// ---- Feedback (student clinic-visit ratings) ----
export const feedbackApi = {
  list: (studentId) => api.get(`/feedback/${studentId}`),
  submit: (body) => api.post('/feedback', body),
}

// ---- Reports ----
export const reportsApi = {
  get: (params, opts) => api.get('/api/reports/', params, opts),
  departments: (opts) => api.get('/api/reports/departments', undefined, opts),
}

// ---- Admin Management (Admins roster) ----
export const adminsApi = {
  list: (params) => api.get('/api/admins', params),
  me: () => api.get('/api/admins/me'),
  add: (body) => api.post('/api/admins', body),
  deactivate: (adminId) => api.patch(`/api/admins/${adminId}/deactivate`, {}),
  activate: (adminId) => api.patch(`/api/admins/${adminId}/activate`, {}),
  remove: (adminId, confirmEmail) =>
    request(`/api/admins/${adminId}`, { method: 'DELETE', body: JSON.stringify({ confirmEmail }) }),
  updateProfile: (adminId, body) => api.patch(`/api/admins/${adminId}/profile`, body),
  // Super-admin only: switch another admin between 'admin' and 'super_admin'.
  updateRole: (adminId, role) => api.patch(`/api/admins/${adminId}/role`, { role }),
}

// ---- Clinic Schedule & Settings ----
export const clinicScheduleApi = {
  list: (params) => api.get('/clinic-schedule', params),
  byDate: (workingDate) => api.get(`/clinic-schedule/${workingDate}`),
  preview: (date) => api.get('/clinic-schedule/preview', { date }),
  getSettings: () => api.get('/clinic-settings'),
  updateSettings: (body) => api.put('/clinic-settings', body),
  createOverride: (body) => api.post('/clinic-schedule', body),
  updateOverride: (scheduleId, body) => api.put(`/clinic-schedule/id/${scheduleId}`, body),
  deleteOverride: (scheduleId) => api.del(`/clinic-schedule/id/${scheduleId}`),
}

// ---- Student Records ----
export const recordsApi = {
  header: (studentId) => api.get(`/api/records/${studentId}`),
  addAnnualExam: (studentId, body) => api.post(`/api/records/${studentId}/annual-exams`, body),
  physicalExam: (annualExamId) => api.get(`/api/records/annual-exams/${annualExamId}/physical-examination`),
  savePhysicalExam: (annualExamId, body) => api.put(`/api/records/annual-exams/${annualExamId}/physical-examination`, body),
  labResults: (annualExamId) => api.get(`/api/records/annual-exams/${annualExamId}/lab-results`),
  saveLabResults: (annualExamId, body) => api.put(`/api/records/annual-exams/${annualExamId}/lab-results`, body),
  diagnosis: (annualExamId) => api.get(`/api/records/annual-exams/${annualExamId}/diagnosis`),
  saveDiagnosis: (annualExamId, body) => api.put(`/api/records/annual-exams/${annualExamId}/diagnosis`, body),
  updateAnnualExamStatus: (annualExamId, body) => api.patch(`/api/records/annual-exams/${annualExamId}/status`, body),
  medicalCertificate: (annualExamId) => api.get(`/api/records/annual-exams/${annualExamId}/medical-certificate`),
  medicalSummary: (studentId, opts) => api.get(`/api/records/${studentId}/medical-summary`, undefined, opts),
  updateProfile: (studentId, body) => api.patch(`/api/records/${studentId}/profile`, body),
}

// ---- Public Student Sign-up ----
// These endpoints are unauthenticated (the student has no session yet), so
// they use a raw fetch instead of the `api` helper above — that helper would
// attach a Bearer token and bounce to login on any 401, which is wrong for
// the pre-auth sign-up flow. TODO: move behind a backend /auth router once
// the Python endpoints are finalized.
async function authRequest(path, body) {
  const response = await fetch(toApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error || data?.detail || `Request failed (${response.status})`)
  }
  return data
}

export const authApi = {
  checkEmail: (email) => authRequest('/api/auth/check-email', { email }),
  sendCode: (email) => authRequest('/api/auth/send-code', { email }),
  signup: (payload) => authRequest('/api/auth/signup', payload),
}

// ---- Public Admin Sign-up (allowlisted admin activation) ----
// Same pre-auth, unauthenticated raw-fetch pattern as authApi above. The admin
// email must be on the backend allowlist (an existing, deactivated or pending
// admin record) before a code can be sent and the account activated.
export const adminAuthApi = {
  checkEmail: (email) => authRequest('/api/auth/admin/check-email', { email }),
  sendCode: (email, invitationToken) => authRequest('/api/auth/admin/send-code', {
    email,
    ...(invitationToken ? { invitation_token: invitationToken } : {}),
  }),
  signup: (payload) => authRequest('/api/auth/admin/signup', payload),
}

// ---- Public Student Forgot Password ----
// Same pre-auth, unauthenticated raw-fetch pattern as authApi above.
//   POST /api/auth/forgot/check-email { email }        -> 200 { success, message }
//   POST /api/auth/forgot/send-code   { email }        -> 200 { success, message }
//   POST /api/auth/forgot/reset       { email, code,
//                                       password,
//                                       confirmPassword } -> 200 | 400
export const forgotApi = {
  checkEmail: (email) => authRequest('/api/auth/forgot/check-email', { email }),
  sendCode: (email) => authRequest('/api/auth/forgot/send-code', { email }),
  reset: (payload) => authRequest('/api/auth/forgot/reset', payload),
}
