// Pure query-param serialization shared by the API client and tests.
// Categorical filters use repeated keys (department_id=1&department_id=2)
// so every selected value reaches the backend. Arrays are sorted/deduped to
// keep cache keys stable regardless of click order.
export function appendRequestParams(searchParams, params) {
  if (!params) return searchParams

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const values = [
        ...new Set(
          value
            .filter((item) => item !== undefined && item !== null && item !== '')
            .map(String)
        ),
      ].sort()
      values.forEach((item) => searchParams.append(key, item))
      return
    }
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })

  return searchParams
}
