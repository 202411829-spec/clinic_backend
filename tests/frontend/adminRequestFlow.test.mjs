import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const signup = readFileSync("src/pages/auth/AdminSignUp.jsx", "utf8")
const panel = readFileSync("src/components/admin/AdminsPanel.jsx", "utf8")
const pending = readFileSync("src/pages/admin/Pending.jsx", "utf8")

test("admin signup sends a code then submits the complete request payload", () => {
  assert.match(signup, /await adminAuthApi\.sendCode\(\s*emailToVerify,\s*isInvitation \? invitationToken : undefined,\s*\)/)
  assert.match(signup, /await adminAuthApi\.signup\(\{[\s\S]*?email: normalizeEmail\(email\)/)
  for (const key of [
    "code,",
    "password,",
    "confirmPassword,",
    "last_name:",
    "first_name:",
    "middle_initial:",
    "suffix:",
    "license_no:",
    "? { invitation_token: invitationToken }",
  ]) {
    assert.ok(signup.includes(key), `missing payload key ${key}`)
  }
  assert.match(signup, /middle_initial: formatAdminMiddleInitial\(middleInitial\) \|\| undefined/)
  assert.doesNotMatch(signup, /formatMiddleInitial\(middleInitial\)/)
  assert.match(signup, /suffix: suffix\.trim\(\) \|\| undefined/)
  assert.match(signup, /if \(!isValidAdminMiddleInitial\(middleInitial\)\)/)

  const signupCall = signup.indexOf("await adminAuthApi.signup(")
  const successState = signup.indexOf("setSubmitted(true)")
  const catchStart = signup.indexOf("} catch (err)", signupCall)
  assert.ok(signupCall >= 0, "admin signup request is not awaited")
  assert.ok(successState > signupCall, "success state must be set after the backend confirms creation")
  assert.ok(successState < catchStart, "success state must not be inside the failure handler")
})

test("admin signup sends a fixed admin role for ordinary requests with no self-selection", () => {
  assert.match(signup, /role: 'admin'/)
  assert.match(signup, /\.\.\.\(isInvitation[\s\S]*?invitation_token: invitationToken[\s\S]*?role: 'admin'/)
  assert.doesNotMatch(signup, /setRole/)
  assert.doesNotMatch(signup, /admin-signup-role/)
  assert.doesNotMatch(signup, /Select role/)
  assert.doesNotMatch(signup, /Please select a role/)
  assert.doesNotMatch(signup, /'nurse'|'doctor'/)
  assert.doesNotMatch(signup, /role: 'super_admin'/)
  assert.doesNotMatch(signup, /role: invitationRole/)
})

test("invitation links prefill and lock the invited email", () => {
  assert.match(signup, /useSearchParams/)
  assert.match(signup, /normalizeEmail\(searchParams\.get\('email'\) \|\| ''\)/)
  assert.match(signup, /const invitationToken = \(searchParams\.get\('invite_token'\) \|\| ''\)\.trim\(\)/)
  assert.match(signup, /useState\(invitedEmail\)/)
  assert.match(signup, /readOnly=\{isInvitation\}/)
  assert.match(signup, /aria-readonly=\{isInvitation\}/)
  assert.match(signup, /Invited as \{roleLabel\}/)
  assert.match(signup, /\{!isInvitation && \(/)
})

test("invitation OTP and final signup use the token-resolved email", () => {
  assert.match(signup, /async function sendVerificationCode\(emailToVerify\) \{/)
  assert.match(signup, /normalizeEmail\(data\?\.email \|\| emailToVerify\)/)
  assert.match(signup, /setEmail\(confirmedEmail\)/)
  assert.match(signup, /return confirmedEmail/)
  assert.match(signup, /const confirmedEmail = await sendVerificationCode\(normalizedEmail\)/)
  assert.match(signup, /email: normalizeEmail\(email\)/)
  assert.match(signup, /\.\.\.\(isInvitation[\s\S]*?invitation_token: invitationToken/)
  assert.doesNotMatch(signup, /localStorage/)
  assert.doesNotMatch(signup, /sessionStorage/)
  assert.doesNotMatch(signup, /normalizedEmail !== invitedEmail/)
})

test("invitation signup shows an active-account success state", () => {
  assert.match(signup, /Invitation accepted/)
  assert.match(signup, /Your admin account is active\. You can sign in now\./)
  assert.match(signup, /Complete signup/)
})

test("admin signup shows a clear backend-confirmed success screen", () => {
  assert.ok(
    signup.includes(
      "Admin request submitted successfully. Your request is pending approval from an existing administrator."
    )
  )
  assert.match(signup, /'Request submitted'/)
  assert.match(signup, />\s*Back to Login\s*<\/button>/)
  assert.ok(signup.indexOf("if (submitted) {") < signup.indexOf("<form"))
  assert.doesNotMatch(signup, /setTimeout\(\(\) => navigate\('\/admin\/login'\)/)
})

test("admin signup failure stays on the form with the friendly error", () => {
  const signupCall = signup.indexOf("await adminAuthApi.signup(")
  const catchStart = signup.indexOf("} catch (err)", signupCall)
  const finallyStart = signup.indexOf("} finally", catchStart)
  const catchBlock = signup.slice(catchStart, finallyStart)

  assert.match(catchBlock, /const msg = friendlyPasswordError\(err,/)
  assert.match(catchBlock, /setFieldError\(msg\)/)
  assert.doesNotMatch(catchBlock, /setSubmitted\(true\)/)
  assert.doesNotMatch(catchBlock, /navigate\(/)
  assert.match(signup, /async function handleProfileSubmit\(e\) \{[\s\S]*?if \(busy \|\| submitted\) return/)
})

test("admin signup success screen navigates only through Back to Login", () => {
  assert.match(signup, /onClick=\{\(\) => navigate\('\/admin\/login'\)\}/)
  assert.doesNotMatch(signup, /navigate\('\/admin\/login'\)[\s\S]*?setSubmitted\(true\)/)
})

test("admin signup collects full name fields in the required order with generic placeholders", () => {
  const ids = [
    'id="admin-signup-last-name"',
    'id="admin-signup-first-name"',
    'id="admin-signup-middle-initial"',
    'id="admin-signup-suffix"',
  ]
  const positions = ids.map((id) => signup.indexOf(id))

  assert.ok(positions.every((position) => position >= 0), "missing admin signup name field")
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "name fields are not in Last, First, Middle Initial, Suffix order"
  )

  for (const placeholder of ["Last Name", "First Name", "Middle Initial", "Suffix", "License Number"]) {
    assert.ok(signup.includes(`placeholder="${placeholder}"`), `missing placeholder ${placeholder}`)
  }
  for (const sample of ['placeholder="Ramos"', 'placeholder="Joseph Daniel"', 'placeholder="B"', 'placeholder="Jr."', 'placeholder="e.g. RN-123456"']) {
    assert.ok(!signup.includes(sample), `sample placeholder still present: ${sample}`)
  }

  assert.doesNotMatch(signup, /Name preview:/)
  assert.doesNotMatch(signup, /formatAdminFormalName/)
})

test("admin signup clears the email confirmation before the Profile step", () => {
  assert.match(signup, /function handleCodeSubmit\(e\) \{[\s\S]*?setInfo\(''\)[\s\S]*?setStep\(3\)/)
})

test("admin signup treats the code step as continuation, not server verification", () => {
  assert.match(signup, /if \(code\.length !== 6\)/)
  assert.match(signup, /'Continue'/)
  assert.doesNotMatch(signup, /'Verify code'/)
  assert.match(signup, /if \(\/code\/i\.test\(msg\)\)/)
  assert.match(signup, /setStep\(2\)/)
})

test("admin signup uses the signup-specific email validator for the QA exception", () => {
  assert.match(signup, /validateAdminSignupEmail\(normalizedEmail\)/)
  assert.doesNotMatch(signup, /validateAdminEmail\(normalizedEmail\)/)
})

test("admin approval panel lists pending requests and wires accept/reject", () => {
  assert.match(panel, /adminsApi\.list\(\{[^}]*view: 'pending'/)
  assert.match(panel, /await adminsApi\.activate\(admin\.admin_id\)/)
  assert.match(panel, /await adminsApi\.remove\(confirmTarget\.admin_id, confirmEmail\.trim\(\)\)/)
  assert.match(panel, /confirmTarget\.status === 'pending' \? 'Reject request\?' : 'Delete admin\?'/)
  assert.match(panel, /A request already exists for \$\{email\}; no duplicate was created/)
  assert.match(panel, /Resend invite/)
  assert.match(panel, /formatAdminFormalName\(a\)/)
  assert.doesNotMatch(panel, /\[a\.first_name, a\.last_name\]\.filter\(Boolean\)\.join\(' '\)/)
})

test("pending invitations show invitation status and hide approval actions", () => {
  assert.match(panel, /<th>Status<\/th>/)
  assert.match(panel, /a\.is_invitation/)
  assert.match(panel, /a\.invitation_status \|\| 'Awaiting signup'/)
  assert.match(panel, /Pending approval/)
  assert.match(panel, /\{!a\.is_invitation && \(/)
})

test("pending applicant page refreshes its own admin status", () => {
  assert.match(pending, /Pending approval/)
  assert.match(pending, /window\.location\.reload\(\)/)
  assert.match(pending, /You can refresh after an admin approves your request/)
})
