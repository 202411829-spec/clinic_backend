// Pure presentation mapping for the password strength meter. Strength is read
// only from the shared validator's result; the password string is used solely
// to derive the visible character-type chips. This file never imports or
// re-runs password policy.

// Strength still counts every validator requirement, including hidden rules.
const VALIDATOR_REQUIREMENT_KEYS = [
  'length',
  'groups',
  'notCommon',
  'notPersonal',
  'notRepeated',
  'notSequential',
]

// Only these four items are visible. Lowercase is intentionally absent even
// though it remains part of the validator's 3-of-4 character-group rule.
export const PASSWORD_STRENGTH_REQUIREMENTS = [
  { key: 'length', label: 'At least 12 characters' },
  { key: 'uppercase', label: 'Uppercase letter' },
  { key: 'number', label: 'Number' },
  { key: 'symbol', label: 'Symbol' },
]

// Display-only patterns, mirroring the four character groups the validator
// already checks. They do not decide validity or strength.
const DISPLAY_GROUP_PATTERNS = {
  uppercase: /[A-Z]/,
  number: /[0-9]/,
  symbol: /[^A-Za-z0-9]/,
}

const LEVELS = {
  empty: { label: 'Enter a password', segments: 0, fill: 'bg-gray-300', text: 'text-gray-500' },
  weak: { label: 'Weak', segments: 1, fill: 'bg-red-500', text: 'text-red-600' },
  fair: { label: 'Fair', segments: 2, fill: 'bg-amber-500', text: 'text-amber-700' },
  good: { label: 'Good', segments: 3, fill: 'bg-gc-green-700', text: 'text-gc-green-700' },
  strong: { label: 'Strong', segments: 4, fill: 'bg-gc-green-700', text: 'text-gc-green-700' },
}

/**
 * Map a `validatePassword(...)` result to what the meter should show.
 * Invalid passwords are never Good or Strong, no matter how many
 * requirements they satisfy.
 *
 * @param {{ code?: string, valid?: boolean, strength?: string, requirements?: Record<string, boolean> } | null | undefined} check
 * @param {string} password display-only input for visible character-type chips
 * @returns {{ level: string, label: string, segments: number, fill: string, text: string, requirements: Array<{ key: string, label: string, met: boolean }> }}
 */
export function getPasswordStrengthView(check, password = '') {
  const rawMet = (key) => Boolean(check?.requirements?.[key])

  let level
  if (!check || check.code === 'required') {
    level = 'empty'
  } else {
    const metCount = VALIDATOR_REQUIREMENT_KEYS.filter((key) => rawMet(key)).length
    if (!check.valid) {
      level = metCount * 2 < VALIDATOR_REQUIREMENT_KEYS.length ? 'weak' : 'fair'
    } else if (check.strength === 'strong') {
      level = 'strong'
    } else {
      level = 'good'
    }
  }

  // Presentation-only: an untouched field must not show green checks, even
  // though the validator reports trivially-passing hidden rules as satisfied.
  const forceAllUnmet = level === 'empty'
  const requirements = PASSWORD_STRENGTH_REQUIREMENTS.map(({ key, label }) => ({
    key,
    label,
    met: forceAllUnmet
      ? false
      : key === 'length'
        ? rawMet('length')
        : DISPLAY_GROUP_PATTERNS[key].test(password),
  }))

  return { level, requirements, ...LEVELS[level] }
}
