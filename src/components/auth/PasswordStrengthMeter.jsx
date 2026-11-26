// Live strength readout for password fields. Render-only: strength comes from
// the shared validator result via `check`; the raw password is forwarded only
// for the visible display-only checklist. It never re-implements policy.

import { CheckIcon } from '../ui/icons.jsx'
import { getPasswordStrengthView } from '../../lib/passwordStrengthView.js'

/**
 * @param {{ id?: string, check?: { code?: string, valid?: boolean, strength?: string, requirements?: Record<string, boolean> } | null, password?: string }} props
 *   `id` lets the password input point `aria-describedby` at this block.
 *   `check` is the full result of the shared password validator and drives
 *   strength. `password` only drives the visible character-type chips.
 */
export default function PasswordStrengthMeter({ id, check = null, password = '' }) {
  const view = getPasswordStrengthView(check, password)

  return (
    <div id={id} className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              index < view.segments ? view.fill : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mt-1 text-xs font-medium ${view.text}`}
      >
        Password strength: {view.label}
      </p>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {view.requirements.map((entry) => (
          <li
            key={entry.key}
            className={`flex items-start gap-1.5 text-xs ${entry.met ? 'text-gc-green-700' : 'text-gray-500'}`}
          >
            {entry.met ? (
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gc-green-700" />
            ) : (
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
            )}
            <span>{entry.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
