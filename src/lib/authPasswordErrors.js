export const WEAK_PASSWORD_MESSAGE =
  "That password does not meet the account security requirements. Please choose a different one."

const WEAK_PASSWORD_MARKERS = [
  "weak_password",
  "weak password",
  "password cannot be longer",
  "password should be at least",
  "should contain at least one character",
  "password is too weak",
  "validation_failed",
  "data breach",
  "pwned",
  "leaked password",
]

function isWeakPasswordError(error) {
  if (!error) return false

  const parts = []
  for (const key of ["code", "message", "msg", "details"]) {
    const value = error[key]
    if (value) parts.push(String(value))
  }
  parts.push(String(error))

  const text = parts.join(" ").toLowerCase()
  return WEAK_PASSWORD_MARKERS.some((marker) => text.includes(marker))
}

export function friendlyPasswordError(error, fallback = WEAK_PASSWORD_MESSAGE) {
  if (isWeakPasswordError(error)) return WEAK_PASSWORD_MESSAGE
  if (error && typeof error.message === "string" && error.message) return error.message
  return fallback
}
