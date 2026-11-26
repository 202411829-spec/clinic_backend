import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lightweight source-contract checks: there is no DOM test library installed,
// so these assert on the login sources themselves instead of rendered markup.
const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

const readOrReport = (relativePath) => {
  try {
    return read(relativePath)
  } catch {
    assert.fail(`${relativePath} should exist so its login UI contract can be checked`)
  }
}

const ADMIN_FORM = 'src/components/auth/LoginForm.jsx'
const STUDENT_FORM = 'src/components/auth/StudentLoginForm.jsx'
const LOGIN_EXTRAS = 'src/components/auth/LoginFormExtras.jsx'
const ICONS = 'src/components/ui/icons.jsx'
const STUDENT_PAGE = 'src/pages/auth/StudentLogin.jsx'

const LOGIN_FORMS = [
  { label: 'LoginForm (admin)', path: ADMIN_FORM },
  { label: 'StudentLoginForm', path: STUDENT_FORM },
]

function inputClassUsages(source) {
  return [...source.matchAll(/className=\{`\$\{inputClass\}([^`]*)`\}/g)].map((m) => m[1])
}

test('both login forms lead their inputs with UserIcon and LockIcon and keep the eye toggle', () => {
  for (const { label, path } of LOGIN_FORMS) {
    const source = read(path)

    assert.match(
      source,
      /import \{[^}]*UserIcon[^}]*\} from '\.\.\/ui\/icons\.jsx'/,
      `${label} should import UserIcon from the local icon set`
    )
    assert.match(
      source,
      /import \{[^}]*LockIcon[^}]*\} from '\.\.\/ui\/icons\.jsx'/,
      `${label} should import LockIcon from the local icon set`
    )
    assert.match(source, /<UserIcon\b/, `${label} should render UserIcon inside the username field`)
    assert.match(source, /<LockIcon\b/, `${label} should render LockIcon inside the password field`)
    assert.ok(
      (source.match(/className="relative"/g) ?? []).length >= 2,
      `${label} should wrap both inputs in relative containers so the icons can sit inside them`
    )

    const usages = inputClassUsages(source)
    assert.equal(usages.length, 2, `${label} should style both inputs from the shared inputClass`)
    assert.ok(
      usages.every((usage) => usage.includes('pl-11')),
      `${label} should add pl-11 to both inputs so text clears the leading icon`
    )
    assert.ok(
      usages.some((usage) => usage.includes('pr-11')),
      `${label} password input should keep pr-11 so text clears the eye toggle`
    )

    assert.ok(source.includes('EyeIcon'), `${label} should keep the EyeIcon in its password toggle`)
    assert.ok(source.includes('EyeOffIcon'), `${label} should keep the EyeOffIcon in its password toggle`)
    assert.match(
      source,
      /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/,
      `${label} should keep the toggle's aria-label behavior`
    )
  }

  const admin = read(ADMIN_FORM)
  assert.ok(
    inputClassUsages(admin).some((usage) => usage.includes('pr-[168px]')),
    'LoginForm (admin) should keep pr-[168px] so text cannot overlap the @gordoncollege.edu.ph suffix'
  )
})

test('leading field icons are vertically centered inside their inputs', () => {
  for (const { label, path } of LOGIN_FORMS) {
    const source = read(path)
    const leadingIcons = [...source.matchAll(/<(?:User|Lock)Icon className="([^"]+)"/g)]
    assert.equal(
      leadingIcons.length,
      2,
      `${label} should render exactly two leading field icons to check for centering`
    )
    for (const [, className] of leadingIcons) {
      assert.match(
        className,
        /top-1\/2/,
        `${label} leading icons should anchor at the input's vertical midpoint`
      )
      assert.match(
        className,
        /-translate-y-1\/2/,
        `${label} leading icons should offset by half their height so they sit centered`
      )
    }
  }
})

test('admin username reserves responsive space for the email suffix', () => {
  const source = read(ADMIN_FORM)
  assert.match(
    source,
    /pl-11 pr-\[124px\] sm:pr-\[168px\]/,
    'admin username should reserve less suffix space on small screens and keep the desktop reservation'
  )
  const suffixClass = source.match(/<span[^>]*className="([^"]+)"[^>]*>\s*@gordoncollege\.edu\.ph/)
  assert.ok(suffixClass, 'admin email suffix should still be rendered')
  assert.match(
    suffixClass[1],
    /(?:^|\s)text-xs(?:\s|$)/,
    'admin email suffix should use compact text on small screens'
  )
  assert.match(
    suffixClass[1],
    /sm:text-sm/,
    'admin email suffix should return to normal size on wider screens'
  )
})

test('both login forms share the same username field contract', () => {
  for (const { label, path } of LOGIN_FORMS) {
    const source = read(path)

    assert.match(
      source,
      /<label htmlFor="[^"]+"[^>]*>\s*Username\s*<\/label>/,
      `${label} should label its username field "Username"`
    )
    assert.match(source, /placeholder="Username"/, `${label} should use "Username" as the placeholder`)
    assert.match(
      source,
      /<span className="[^"]*pointer-events-none[^"]*">\s*@gordoncollege\.edu\.ph\s*<\/span>/,
      `${label} should show the domain suffix as visual-only text inside the username field`
    )
    assert.ok(
      inputClassUsages(source).some((usage) => usage.includes('pr-[124px]') && usage.includes('sm:pr-[168px]')),
      `${label} should reserve the same responsive space for the suffix as the admin form`
    )
  }
})

test('login forms offer Remember me beside their own forgot-password link', () => {
  const extras = readOrReport(LOGIN_EXTRAS)
  assert.match(extras, /export function RememberMe/, 'LoginFormExtras should export RememberMe')
  assert.match(extras, /Remember me/, 'RememberMe should render the exact label "Remember me"')

  for (const { label, path, href, id } of [
    { label: 'LoginForm (admin)', path: ADMIN_FORM, href: '/admin/forgot-password', id: 'admin-remember' },
    { label: 'StudentLoginForm', path: STUDENT_FORM, href: '/student/forgot-password', id: 'student-remember' },
  ]) {
    const source = read(path)
    assert.match(
      source,
      /import \{[^}]*RememberMe[^}]*\} from '\.\/LoginFormExtras\.jsx'/,
      `${label} should import the shared RememberMe`
    )
    assert.match(
      source,
      new RegExp(`<RememberMe id="${id}"`),
      `${label} should render RememberMe with a unique checkbox id`
    )

    const row = source.match(/<div className="[^"]*justify-between[^"]*">[\s\S]*?<\/div>/)
    assert.ok(
      row,
      `${label} should lay Remember me and Forgot password out in a responsive justify-between row`
    )
    assert.ok(row[0].includes('<RememberMe'), `${label} row should place Remember me on the left`)
    assert.ok(row[0].includes(`href="${href}"`), `${label} row should keep its own forgot-password href`)
    assert.ok(row[0].includes('Forgot password?'), `${label} should keep the Forgot password? link text`)
    assert.ok(
      source.includes('Forgot password?'),
      `${label} should keep the visible Forgot password? text`
    )
  }

  const admin = read(ADMIN_FORM)
  const student = read(STUDENT_FORM)
  assert.ok(
    !admin.includes('/student/forgot-password'),
    'LoginForm (admin) must not point at the student forgot-password route'
  )
  assert.ok(
    !student.includes('/admin/forgot-password'),
    'StudentLoginForm must not point at the admin forgot-password route'
  )
})

test('login forms render the shared disabled Google placeholder above the privacy note', () => {
  const extras = readOrReport(LOGIN_EXTRAS)
  assert.match(
    extras,
    /export function GoogleSignInPlaceholder/,
    'LoginFormExtras should export GoogleSignInPlaceholder'
  )
  assert.ok(extras.includes('or continue with'), 'the divider should say exactly "or continue with"')
  assert.ok(
    extras.includes('Continue with Google (Coming soon)'),
    'the button should say exactly "Continue with Google (Coming soon)"'
  )

  const button = extras.match(/<button[\s\S]*?Continue with Google \(Coming soon\)[\s\S]*?<\/button>/)
  assert.ok(button, 'GoogleSignInPlaceholder should render the Google button')
  assert.match(button[0], /type="button"/, 'the Google button must not submit the form')
  assert.match(button[0], /\sdisabled(\s|=|>)/, 'the Google button must be disabled')
  assert.match(button[0], /aria-disabled="true"/, 'the Google button must expose aria-disabled')
  assert.match(
    button[0],
    /aria-(label|describedby)="[^"]*[Cc]oming soon/,
    'the Google button must announce that it is coming soon'
  )
  assert.ok(!extras.includes('onClick'), 'the Google placeholder must not wire any click handler')

  for (const { label, path } of LOGIN_FORMS) {
    const source = read(path)
    assert.match(
      source,
      /import \{[^}]*GoogleSignInPlaceholder[^}]*\} from '\.\/LoginFormExtras\.jsx'/,
      `${label} should import the shared GoogleSignInPlaceholder`
    )
    const placeholderIndex = source.indexOf('<GoogleSignInPlaceholder')
    assert.ok(placeholderIndex >= 0, `${label} should render GoogleSignInPlaceholder after submit`)
    assert.ok(
      source.indexOf('type="submit"') < placeholderIndex,
      `${label} should render the Google placeholder after its submit button`
    )
    assert.ok(
      placeholderIndex < source.indexOf('Gordon College Privacy Notice'),
      `${label} should keep the privacy paragraph below the Google placeholder`
    )
    assert.ok(
      source.includes('Gordon College Privacy Notice'),
      `${label} should keep its privacy paragraph`
    )
  }
})

test('login UI stays free of storage, OAuth, and Google API wiring', () => {
  // The shared extras file is part of this feature; without it there is nothing
  // to audit for stray auth wiring, so its absence fails this contract.
  const sources = [
    { label: 'LoginForm (admin)', source: read(ADMIN_FORM) },
    { label: 'StudentLoginForm', source: read(STUDENT_FORM) },
    { label: 'LoginFormExtras', source: readOrReport(LOGIN_EXTRAS) },
    { label: 'icons', source: read(ICONS) },
    { label: 'StudentLogin page', source: read(STUDENT_PAGE) },
  ]

  const forbidden = [
    { pattern: /localStorage|sessionStorage|document\.cookie/, what: 'storage calls' },
    { pattern: /oauth/i, what: 'OAuth references' },
    { pattern: /gapi|googleapis|accounts\.google/i, what: 'Google API references' },
    { pattern: /signInWithOAuth|signInWithPopup|signInWithRedirect/, what: 'provider sign-in calls' },
    { pattern: /href="[^"]*google|to="[^"]*google/i, what: 'Google routes' },
  ]

  for (const { label, source } of sources) {
    for (const { pattern, what } of forbidden) {
      assert.ok(
        !pattern.test(source),
        `${label} should not contain ${what}`
      )
    }
  }

  for (const { label, path } of LOGIN_FORMS) {
    const source = read(path)
    assert.match(
      source,
      /onSubmit\?\.\(\{ username, password \}\)/,
      `${label} should still submit only { username, password }`
    )
    const submitCount = (source.match(/onSubmit\?\./g) ?? []).length
    assert.equal(submitCount, 1, `${label} should call onSubmit exactly once`)
    const handleSubmit = source.match(/function handleSubmit\(e\) \{[\s\S]*?\n  \}/)
    assert.ok(handleSubmit, `${label} should keep its handleSubmit`)
    assert.ok(
      !/remember/i.test(handleSubmit[0]),
      `${label} handleSubmit must not send remember-me state to the backend`
    )
  }
})

test('Remember me is a UI-only animated checkbox wired to its label', () => {
  const extras = readOrReport(LOGIN_EXTRAS)
  const checkboxComponent = readOrReport('src/components/ui/AnimatedCheckbox.jsx')
  const usage = extras.match(/<AnimatedCheckbox[^>]*>/)
  assert.ok(usage, 'RememberMe should render the shared AnimatedCheckbox')
  assert.match(usage[0], /id=\{id\}/, 'the checkbox should take its id from props')
  assert.ok(!/\sname=/.test(usage[0]), 'the checkbox must not send a name to the backend')
  assert.ok(!/\svalue=/.test(usage[0]), 'the checkbox must not carry a value')
  assert.ok(!/\schecked=/.test(usage[0]), 'the checkbox must not be controlled state')
  assert.match(
    extras,
    /<label[^>]*htmlFor=\{id\}/,
    'the label should target the checkbox via htmlFor so keyboard activation works'
  )
  assert.match(checkboxComponent, /<input[^>]*type="checkbox"/, 'AnimatedCheckbox keeps native semantics')
  assert.match(
    checkboxComponent,
    /gc-checkbox-input/,
    'AnimatedCheckbox exposes the GC-RFB visual box'
  )
  for (const pattern of [/useState/, /localStorage/, /sessionStorage/, /document\.cookie/, /onSubmit/]) {
    assert.ok(!pattern.test(extras), `RememberMe must stay UI-only (no ${pattern})`)
  }
})

test('icons module exports leading-field icons and a four-color Google mark', () => {
  const icons = read(ICONS)
  for (const name of ['UserIcon', 'LockIcon', 'GoogleIcon']) {
    assert.match(
      icons,
      new RegExp(`export function ${name}\\(props\\)`),
      `icons.jsx should export ${name} using the existing props pattern`
    )
  }
  const google = icons.match(/export function GoogleIcon\(props\) \{[\s\S]*?\n\}/)
  assert.ok(google, 'GoogleIcon should be a self-contained component')
  for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) {
    assert.ok(google[0].includes(color), `GoogleIcon should use the Google mark color ${color}`)
  }
  for (const name of ['UserIcon', 'LockIcon', 'GoogleIcon']) {
    const icon = icons.match(new RegExp(`export function ${name}\\(props\\) \\{[\\s\\S]*?\\n\\}`))
    assert.match(
      icon[0],
      /aria-hidden="true"/,
      `${name} should be decorative with aria-hidden="true"`
    )
    assert.match(icon[0], /\{\.\.\.props\}/, `${name} should accept className via props`)
  }
})

test('student footer uses the approved prompt and keeps the signup link', () => {
  const page = read(STUDENT_PAGE)
  assert.ok(
    page.includes("No account yet?{' '}"),
    'StudentLogin footer should say "No account yet?" followed by a space'
  )
  assert.ok(
    !page.includes("Don't have an account?"),
    'StudentLogin footer should drop the old "Don\'t have an account?" copy'
  )
  assert.ok(page.includes('to="/student/signup"'), 'the footer should still link to /student/signup')
  assert.match(page, />[\s\n]*Sign up[\s\n]*</, 'the footer should still show the "Sign up" link text')
})
