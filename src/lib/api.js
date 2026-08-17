const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

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
}

// ---- Student Masterlist ----
export const masterlistApi = {
  listStudents: (params) => api.get('/api/masterlist/students', params),
  getStudent: (studentId) => api.get(`/api/masterlist/students/${studentId}`),
  listDepartments: () => api.get('/api/masterlist/departments'),
  listCourses: (departmentId) => api.get('/api/masterlist/courses', { department_id: departmentId }),
  listYears: () => api.get('/api/masterlist/years'),
}
