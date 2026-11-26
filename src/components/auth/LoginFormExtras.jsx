import AnimatedCheckbox from '../ui/AnimatedCheckbox.jsx'
import { GoogleIcon } from '../ui/icons.jsx'

// UI-only extras shared by the admin and student login forms.
// Remember me and the Google button change nothing about authentication.

export function RememberMe({ id }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
      <AnimatedCheckbox id={id} style={{ "--gc-cb-size": "14px" }} />
      Remember me
    </label>
  )
}

export function GoogleSignInPlaceholder() {
  return (
    <div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        <span>or continue with</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label="Continue with Google (Coming soon)"
        className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-500 opacity-60 shadow-sm"
      >
        <GoogleIcon className="h-5 w-5" />
        Continue with Google (Coming soon)
      </button>
    </div>
  )
}
