import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const forms = [
  {
    file: "src/components/auth/LoginForm.jsx",
    iconImport: "../ui/icons.jsx",
    fields: [{ id: "password", state: "showPassword" }],
  },
  {
    file: "src/components/auth/StudentLoginForm.jsx",
    iconImport: "../ui/icons.jsx",
    fields: [{ id: "student-password", state: "showPassword" }],
  },
  {
    file: "src/components/auth/StudentSignUpForm.jsx",
    iconImport: "../ui/icons.jsx",
    fields: [
      { id: "signup-password", state: "showPassword" },
      { id: "signup-confirm", state: "showConfirmPassword" },
    ],
  },
  {
    file: "src/pages/auth/AdminSignUp.jsx",
    iconImport: "../../components/ui/icons.jsx",
    fields: [
      { id: "admin-signup-password", state: "showPassword" },
      { id: "admin-signup-confirm", state: "showConfirmPassword" },
    ],
  },
  {
    file: "src/components/auth/ForgotPasswordForm.jsx",
    iconImport: "../ui/icons.jsx",
    fields: [
      { id: "forgot-password", state: "showPassword" },
      { id: "forgot-confirm", state: "showConfirmPassword" },
    ],
  },
  {
    file: "src/components/student/ForgotPasswordForm.jsx",
    iconImport: "../ui/icons.jsx",
    fields: [
      { id: "forgot-password", state: "showPassword" },
      { id: "forgot-confirm", state: "showConfirmPassword" },
    ],
  },
]

function read(file) {
  return readFileSync(file, "utf8")
}

function setterFor(state) {
  return `set${state.charAt(0).toUpperCase()}${state.slice(1)}`
}

function inputBlock(source, id) {
  const idAt = source.indexOf(`id="${id}"`)
  assert.ok(idAt >= 0, `missing password input id ${id}`)

  const start = source.lastIndexOf("<input", idAt)
  const end = source.indexOf("/>", idAt)
  assert.ok(start >= 0 && end > idAt, `could not read input block for ${id}`)

  return { start, end, block: source.slice(start, end + 2) }
}

function assertPasswordToggle(source, id, state) {
  const { start, end, block } = inputBlock(source, id)
  const before = source.slice(Math.max(0, start - 160), start)
  const after = source.slice(end + 2, end + 900)

  assert.ok(before.includes('<div className="relative">'), `${id} is not inside a relative wrapper`)
  assert.ok(block.includes(`type={${state} ? 'text' : 'password'}`), `${id} does not switch text/password type`)
  assert.ok(block.includes("pr-11"), `${id} does not reserve space for the eye button`)

  assert.match(after, /<button\s+type="button"/, `${id} has no eye button`)
  assert.ok(after.includes(`${setterFor(state)}((v) => !v)`), `${id} eye button does not toggle ${state}`)
  assert.ok(
    after.includes(`aria-label={${state} ? 'Hide password' : 'Show password'}`),
    `${id} eye button label does not follow ${state}`
  )
  assert.ok(after.includes("EyeOffIcon") && after.includes("EyeIcon"), `${id} eye button is missing icons`)
}

for (const form of forms) {
  test(`${form.file} password fields have working eye toggles`, () => {
    const source = read(form.file)

    assert.ok(
      source.includes(`from '${form.iconImport}'`),
      `${form.file} does not import EyeIcon/EyeOffIcon from ${form.iconImport}`
    )
    assert.ok(
      existsSync(resolve(dirname(form.file), form.iconImport)),
      `${form.iconImport} imported by ${form.file} does not exist`
    )

    for (const field of form.fields) {
      assertPasswordToggle(source, field.id, field.state)
    }

    const passwordTypeCount = (source.match(/type=\{[^}]*'password'[^}]*\}/g) ?? []).length
    assert.equal(
      passwordTypeCount,
      form.fields.length,
      `${form.file} has a password input that is not covered by this audit`
    )
  })
}

test("confirm password toggles are independent from password toggles", () => {
  for (const form of forms.filter((item) => item.fields.length === 2)) {
    const source = read(form.file)
    const [primary, confirm] = form.fields
    const setter = setterFor(confirm.state)

    assert.notEqual(confirm.state, primary.state, `${form.file} reuses the password toggle for confirm password`)
    assert.equal(
      source.split("\n").filter((line) => line.includes(`const [${confirm.state}, ${setter}]`)).length,
      1,
      `${form.file} is missing a unique ${confirm.state} declaration`
    )
    assertPasswordToggle(source, confirm.id, confirm.state)
  }
})
