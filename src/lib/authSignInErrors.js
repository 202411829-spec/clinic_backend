// Friendly, provider-agnostic messages for Supabase sign-in failures.
// Kept separate from the password-policy helper so login components stay
// free of signup/reset password-strength wiring.

const SIGN_IN_ERROR_RULES = [
  {
    markers: ["invalid_credentials", "invalid login credentials", "invalid password"],
    message: "Incorrect student ID or password. Please try again.",
  },
  {
    markers: ["email not confirmed", "confirm your email"],
    message: "Please confirm your school email before signing in.",
  },
  {
    markers: ["too many requests", "rate limit"],
    message: "Too many sign-in attempts. Please wait a moment and try again.",
  },
  {
    markers: ["failed to fetch", "networkerror", "network error", "fetch failed"],
    message: "Unable to reach the sign-in service. Please check your connection and try again.",
  },
]

function matchesSignInRule(error, markers) {
  const parts = []
  for (const key of ["code", "message", "msg", "details"]) {
    const value = error?.[key]
    if (value) parts.push(String(value))
  }
  parts.push(String(error ?? ""))

  const text = parts.join(" ").toLowerCase()
  return markers.some((marker) => text.includes(marker))
}

export function friendlySignInError(error, fallback = "Unable to log in. Please try again.") {
  for (const rule of SIGN_IN_ERROR_RULES) {
    if (matchesSignInRule(error, rule.markers)) return rule.message
  }
  if (error && typeof error.message === "string" && error.message) return error.message
  return fallback
}
