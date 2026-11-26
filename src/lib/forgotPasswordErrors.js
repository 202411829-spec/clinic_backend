export const FORGOT_SEND_ERROR_MESSAGE =
  'Could not send the verification email. Please try again later.'

const TECHNICAL_ERROR_MARKERS = [
  'winerror',
  'errno',
  'connection refused',
  'actively refused',
  'connecterror',
  'connectionerror',
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network error',
  'name or service not known',
  'request failed (5',
  'internal server error',
  'server could not complete this request',
  'smtp',
  'socket',
  'traceback',
  'timed out',
  'timeout',
]

export function friendlyForgotEmailError(error, fallback = FORGOT_SEND_ERROR_MESSAGE) {
  const message =
    error && typeof error.message === 'string' && error.message.trim()
      ? error.message.trim()
      : ''
  if (!message) return fallback

  const text = message.toLowerCase()
  if (TECHNICAL_ERROR_MARKERS.some((marker) => text.includes(marker))) {
    return FORGOT_SEND_ERROR_MESSAGE
  }
  return message
}
