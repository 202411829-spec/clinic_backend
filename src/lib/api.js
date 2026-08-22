const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000'

async function request(path, { params, ...options } = {}) {
  const url = new URL(path, API_BASE_URL)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || `Request failed (${response.status})`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
}

// ---- Student Masterlist ----
export const masterlistApi = {
  listStudents: (params) => api.get('/api/masterlist/students', params),
  getStudent: (studentId) => api.get(`/api/masterlist/students/${studentId}`),
  listDepartments: () => api.get('/api/masterlist/departments'),
  listCourses: (departmentId) => api.get('/api/masterlist/courses', { department_id: departmentId }),
  listYears: () => api.get('/api/masterlist/years'),
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
  list: (params) => api.get('/appointments', params),
  get: (appointmentId) => api.get(`/appointments/${appointmentId}`),
  create: (body) => api.post('/appointments', body),
  slots: (date) => api.get('/appointments/slots', { date }),
  getStatus: (appointmentId) => api.get(`/appointments/${appointmentId}/status`),
  updateStatus: (appointmentId, body) =>
    api.patch(`/appointments/${appointmentId}/status`, body),
}

// ---- Logbook ----
export const logbookApi = {
  list: () => api.get('/logbook'),
  byStudent: (studentId) => api.get(`/logbook/student/${studentId}`),
  createWalkIn: (body) => api.post('/logbook/walk-in', body),
  addMedicine: (logId, medicines) => api.post(`/logbook/${logId}/medicine`, { medicines }),
}

// Reference tables used by the walk-in / booking forms.
export const referenceApi = {
  reasons: () => api.get('/reasons'),
  medicines: () => api.get('/medicines'),
}

// ---- Reports ----
export const reportsApi = {
  get: (params) => api.get('/api/reports/', params),
  departments: () => api.get('/api/reports/departments'),
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
  medicalCertificate: (annualExamId) => api.get(`/api/records/annual-exams/${annualExamId}/medical-certificate`),
  medicalSummary: (studentId) => api.get(`/api/records/${studentId}/medical-summary`),
}
