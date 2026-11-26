import {
  normalizeEmail,
  validateAdminEmail,
  validateStudentEmail,
} from './signupValidation.js'

const REQUIRED_MESSAGE = 'Please enter your email address.'

export const FORGOT_PASSWORD_VARIANTS = {
  student: {
    portalLabel: 'Student Portal',
    emailLabel: 'Gordon College email',
    emailPlaceholder: '@gordoncollege.edu.ph',
    subtitle: "We'll send a code to your Gordon College email to verify it's you.",
    loginPath: '/student/login',
    normalizeEmail,
    validateEmail: (value) => {
      if (!String(value ?? '').trim()) return REQUIRED_MESSAGE
      return validateStudentEmail(value)
    },
    textAccent: 'text-gc-accent',
    bgAccent: 'bg-gc-accent',
    borderAccent: 'focus:border-gc-accent',
    ringAccent: 'focus:ring-gc-accent/20',
    ringAccentStrong: 'focus:ring-gc-accent/30',
    hoverAccent: 'hover:text-gc-green-600',
    hoverBgAccent: 'hover:bg-gc-green-600',
  },
  admin: {
    portalLabel: 'Admin Portal',
    emailLabel: 'Email',
    emailPlaceholder: 'lastname.firstname@gordoncollege.edu.ph',
    subtitle: "We'll send a code to your Gordon College email to verify it's you.",
    loginPath: '/admin/login',
    normalizeEmail,
    validateEmail: (value) => {
      if (!String(value ?? '').trim()) return REQUIRED_MESSAGE
      return validateAdminEmail(value)
    },
    textAccent: 'text-gc-accent',
    bgAccent: 'bg-gc-green-700',
    borderAccent: 'focus:border-gc-green-700',
    ringAccent: 'focus:ring-gc-green-700/30',
    ringAccentStrong: 'focus:ring-gc-green-700/30',
    hoverAccent: 'hover:text-gc-green-600',
    hoverBgAccent: 'hover:bg-gc-green-800',
  },
}
