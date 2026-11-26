import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { validatePassword } from "../../src/lib/passwordPolicy.js";
import {
  getPasswordStrengthView,
  PASSWORD_STRENGTH_REQUIREMENTS,
} from "../../src/lib/passwordStrengthView.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) =>
  readFileSync(path.join(here, "..", "..", relativePath), "utf8");

// ---------------------------------------------------------------------------
// Pure helper mapping from real validatePassword(...) results.
// Expected level/label/segments are hand-derived literals: for each fixture
// we counted the validator's true requirements by hand and applied the
// approved mapping (empty / <half=weak / >=half=fair / valid+fair=good /
// valid+strong=strong) without consulting getPasswordStrengthView.
// ---------------------------------------------------------------------------

test("empty password maps to empty state with zero filled segments", () => {
  const view = getPasswordStrengthView(validatePassword(""));

  assert.equal(view.level, "empty");
  assert.equal(view.label, "Enter a password");
  assert.equal(view.segments, 0);
});

test("empty state forces every visible checklist entry to unmet", () => {
  // Presentation-only: an untouched field must not show green checks, even
  // though the validator reports trivially-passing hidden rules as satisfied.
  const view = getPasswordStrengthView(validatePassword(""), "");

  assert.equal(view.level, "empty");
  assert.equal(view.requirements.length, 4);
  for (const entry of view.requirements) {
    assert.equal(entry.met, false, `${entry.key} must be unmet in the empty state`);
  }
});

test("missing check maps to the same empty state", () => {
  for (const check of [null, undefined]) {
    const view = getPasswordStrengthView(check);
    assert.equal(view.level, "empty");
    assert.equal(view.label, "Enter a password");
    assert.equal(view.segments, 0);
  }
});

test("weak fixture (2 of 6 requirements true) maps to weak with one red segment", () => {
  // "123456": length=false, groups=false, notCommon=false, notSequential=false
  // → only notPersonal + notRepeated true = 2 < half(3) → weak.
  const check = validatePassword("123456");
  assert.equal(check.valid, false);

  const view = getPasswordStrengthView(check);
  assert.equal(view.level, "weak");
  assert.equal(view.label, "Weak");
  assert.equal(view.segments, 1);
});

test("invalid-but-close fixture (5 of 6 true) maps to fair with two segments", () => {
  // "Hello World": length=false (11 chars), groups=true (upper+lower+space),
  // notCommon/notPersonal/notRepeated/notSequential=true → 5 >= half(3)
  // but valid=false → fair, never Good/Strong.
  const check = validatePassword("Hello World");
  assert.equal(check.valid, false);

  const view = getPasswordStrengthView(check);
  assert.equal(view.level, "fair");
  assert.equal(view.label, "Fair");
  assert.equal(view.segments, 2);
  // Contrast: fair label text must be amber-700; the bar fill stays amber-500.
  assert.equal(view.text, "text-amber-700");
  assert.equal(view.fill, "bg-amber-500");
});

test("fully valid but existing strength fair maps to Good with three segments", () => {
  // "Sun!River2026": 13 chars, 4 groups, valid=true, strength='fair'
  // (length < 16) → good.
  const check = validatePassword("Sun!River2026");
  assert.equal(check.valid, true);
  assert.equal(check.strength, "fair");

  const view = getPasswordStrengthView(check);
  assert.equal(view.level, "good");
  assert.equal(view.label, "Good");
  assert.equal(view.segments, 3);
});

test("fully valid with existing strength strong maps to Strong with four segments", () => {
  // "Coffee!Mug2026Morning": 21 chars (>=20), valid=true, strength='strong'
  // → strong.
  const check = validatePassword("Coffee!Mug2026Morning");
  assert.equal(check.valid, true);
  assert.equal(check.strength, "strong");

  const view = getPasswordStrengthView(check);
  assert.equal(view.level, "strong");
  assert.equal(view.label, "Strong");
  assert.equal(view.segments, 4);
});

test("invalid passwords are never Good or Strong regardless of requirement count", () => {
  // Personal-info fixture: 5 of 6 requirements true but valid=false.
  const personal = validatePassword("MyEmail2026!", {
    email: "myemail@gordoncollege.edu.ph",
  });
  assert.equal(personal.valid, false);

  const invalidChecks = [
    validatePassword("123456"), // 2 of 6 true → weak
    validatePassword("Hello World"), // 5 of 6 true → fair
    personal, // 5 of 6 true → fair
  ];

  for (const check of invalidChecks) {
    const view = getPasswordStrengthView(check);
    assert.ok(
      view.level === "weak" || view.level === "fair",
      `invalid check must not render as ${view.level}`
    );
    assert.notEqual(view.label, "Good");
    assert.notEqual(view.label, "Strong");
    assert.ok(view.segments <= 2, `invalid check filled ${view.segments} segments`);
  }
});

// ---------------------------------------------------------------------------
// Helper output change (no DOM library, so this verifies the pure helper's
// returned values, not a rendered rerender): a weak result replaced by a
// valid/strong result must change level, label, and segments together.
// ---------------------------------------------------------------------------

test("helper output changes level, label, and segments when the check goes from weak to valid strong", () => {
  const before = getPasswordStrengthView(validatePassword("123456"));
  const after = getPasswordStrengthView(validatePassword("Coffee!Mug2026Morning"));

  assert.deepEqual(
    [before.level, before.label, before.segments],
    ["weak", "Weak", 1]
  );
  assert.deepEqual(
    [after.level, after.label, after.segments],
    ["strong", "Strong", 4]
  );

  assert.notEqual(before.level, after.level);
  assert.notEqual(before.label, after.label);
  assert.notEqual(before.segments, after.segments);
});

// ---------------------------------------------------------------------------
// Checklist contract: four visible, display-only items. Validator keys remain
// the source of strength level/segments; character-type flags are derived from
// the password string only for what the user sees.
// ---------------------------------------------------------------------------

test("PASSWORD_STRENGTH_REQUIREMENTS is the four-item visible checklist", () => {
  assert.deepEqual(
    PASSWORD_STRENGTH_REQUIREMENTS.map((entry) => entry.key),
    ["length", "uppercase", "number", "symbol"]
  );
  assert.equal(PASSWORD_STRENGTH_REQUIREMENTS.length, 4);
});

test("visible checklist labels are exact and omit lowercase", () => {
  assert.deepEqual(
    PASSWORD_STRENGTH_REQUIREMENTS.map((entry) => entry.label),
    ["At least 12 characters", "Uppercase letter", "Number", "Symbol"]
  );
  for (const entry of PASSWORD_STRENGTH_REQUIREMENTS) {
    assert.doesNotMatch(
      entry.label,
      /lowercase/i,
      `${entry.key} must not display the hidden lowercase requirement`
    );
  }
});

test("visible checklist flags are derived from the password for display", () => {
  // "Hello!World": 11 characters, uppercase present, no number, symbol "!".
  const password = "Hello!World";
  const check = validatePassword(password);
  const view = getPasswordStrengthView(check, password);

  assert.deepEqual(
    view.requirements.map((entry) => [entry.key, entry.met]),
    [
      ["length", false],
      ["uppercase", true],
      ["number", false],
      ["symbol", true],
    ]
  );
});

test("visible checklist is display-only and does not replace the 3-of-4 rule", () => {
  // "MountainSun2026": uppercase + hidden lowercase + number = 3 groups.
  // Visible symbol is false, but the validator still accepts the 3-of-4 rule
  // and the meter must render Good/3, not a weaker result based on UI flags.
  const password = "MountainSun2026";
  const check = validatePassword(password);
  assert.equal(check.requirements.groups, true);
  assert.equal(check.valid, true);
  assert.equal(check.strength, "fair");

  const view = getPasswordStrengthView(check, password);
  assert.deepEqual(
    view.requirements.map((entry) => [entry.key, entry.met]),
    [
      ["length", true],
      ["uppercase", true],
      ["number", true],
      ["symbol", false],
    ]
  );
  assert.equal(view.level, "good");
  assert.equal(view.label, "Good");
  assert.equal(view.segments, 3);
});

test("hidden requirements still drive strength when all visible items are met", () => {
  // Every visible item passes, but the hidden personal-info rule fails.
  const password = "MyEmail2026!";
  const check = validatePassword(password, {
    email: "myemail@gordoncollege.edu.ph",
  });
  assert.equal(check.requirements.notPersonal, false);
  assert.equal(check.valid, false);

  const view = getPasswordStrengthView(check, password);
  assert.deepEqual(
    view.requirements.map((entry) => entry.met),
    [true, true, true, true]
  );
  assert.equal(view.level, "fair");
  assert.equal(view.label, "Fair");
  assert.equal(view.segments, 2);
});

test("checklist without a check reports every visible requirement unmet", () => {
  const view = getPasswordStrengthView(null);
  assert.equal(view.requirements.length, 4);
  for (const entry of view.requirements) {
    assert.equal(entry.met, false);
  }
});

// ---------------------------------------------------------------------------
// Integration wiring (source-contract): no DOM library is installed, so these
// narrow checks cover only the wiring guarantees the redesign requires.
// ---------------------------------------------------------------------------

function assertPasswordBlockContract(source, { label, inputId, confirmId, meterId }) {
  assert.match(
    source,
    /import PasswordStrengthMeter from/,
    `${label} should import the shared meter`
  );
  assert.match(
    source,
    /const passwordCheck = validatePassword\(password/,
    `${label} should drive the meter from the shared validatePassword result`
  );
  assert.match(
    source,
    new RegExp(
      `<PasswordStrengthMeter id="${meterId}" check=\\{passwordCheck\\} password=\\{password\\} />`
    ),
    `${label} should pass id="${meterId}", check={passwordCheck}, and password`
  );
  assert.doesNotMatch(
    source,
    /<PasswordStrengthMeter[^>]*strength=/,
    `${label} should no longer pass the legacy strength prop`
  );
  assert.doesNotMatch(
    source,
    /PASSWORD_REQUIREMENTS_MESSAGE/,
    `${label} should no longer import or render the long helper text`
  );
  assert.doesNotMatch(
    source,
    /password-requirements/,
    `${label} should drop the stale helper paragraph id`
  );
  assert.match(
    source,
    new RegExp(`aria-describedby="${meterId}"`),
    `${label} should point the password input at the meter id`
  );
  assert.match(source, /friendlyPasswordError/, `${label} keeps friendlyPasswordError`);
  assert.match(source, /EyeIcon/, `${label} keeps the eye toggle icon`);
  assert.match(source, /EyeOffIcon/, `${label} keeps the eye-off toggle icon`);
  assert.match(
    source,
    /setShowPassword\(\(v\) => !v\)/,
    `${label} keeps the visibility toggle handler`
  );
  assert.match(
    source,
    /Passwords do not match\./,
    `${label} keeps confirm-password mismatch validation`
  );

  const inputAt = source.indexOf(`id="${inputId}"`);
  const meterAt = source.indexOf("<PasswordStrengthMeter");
  const confirmAt = source.indexOf(`id="${confirmId}"`);
  assert.ok(inputAt !== -1, `${label} keeps its password input`);
  assert.ok(meterAt !== -1, `${label} renders the meter in JSX`);
  assert.ok(confirmAt !== -1, `${label} keeps its confirm input`);
  assert.ok(
    inputAt < meterAt,
    `${label} should place the meter directly under the password input`
  );
  assert.ok(
    meterAt < confirmAt,
    `${label} should place the meter before the confirm field`
  );

  // No paragraph (or any other block) between the meter and the confirm field.
  const meterEnd = source.indexOf("/>", meterAt) + 2;
  const between = source.slice(meterEnd, confirmAt);
  assert.ok(
    !between.includes("<p"),
    `${label} must have no helper paragraph between the meter and confirm field`
  );
  assert.ok(
    !between.includes("PASSWORD_REQUIREMENTS_MESSAGE"),
    `${label} must not reintroduce the long helper text before confirm`
  );
}

test("student signup wires the meter under the password input", () => {
  assertPasswordBlockContract(read("src/components/auth/StudentSignUpForm.jsx"), {
    label: "StudentSignUpForm",
    inputId: "signup-password",
    confirmId: "signup-confirm",
    meterId: "signup-password-strength",
  });
});

test("admin signup wires the meter under the password input", () => {
  assertPasswordBlockContract(read("src/pages/auth/AdminSignUp.jsx"), {
    label: "AdminSignUp",
    inputId: "admin-signup-password",
    confirmId: "admin-signup-confirm",
    meterId: "admin-signup-password-strength",
  });
});

test("shared reset form wires the meter under the password input", () => {
  assertPasswordBlockContract(read("src/components/auth/ForgotPasswordForm.jsx"), {
    label: "ForgotPasswordForm",
    inputId: "forgot-password",
    confirmId: "forgot-confirm",
    meterId: "forgot-password-strength",
  });
});

test("student reset page keeps using the shared form", () => {
  const source = read("src/pages/auth/ForgotPassword.jsx");
  assert.match(
    source,
    /import ForgotPasswordForm from/,
    "student reset page should import the shared form"
  );
  assert.ok(
    source.includes("<ForgotPasswordForm"),
    "student reset page should render the shared form"
  );
});

test("admin reset page keeps using the shared form with the admin variant", () => {
  const source = read("src/pages/auth/AdminForgotPassword.jsx");
  assert.match(
    source,
    /import ForgotPasswordForm from/,
    "admin reset page should import the shared form"
  );
  assert.ok(
    source.includes("<ForgotPasswordForm"),
    "admin reset page should render the shared form"
  );
  assert.ok(
    source.includes('variant="admin"'),
    "admin reset page should preserve variant=\"admin\""
  );
});

test("login-only forms stay free of password policy and meter wiring", () => {
  const forbidden =
    /validatePassword|passwordPolicy|PasswordStrengthMeter|authPasswordErrors|friendlyPasswordError/;

  for (const file of [
    "src/components/auth/LoginForm.jsx",
    "src/components/auth/StudentLoginForm.jsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, forbidden, `${file} must stay free of password policy wiring`);
  }
});

test("the meter is render-only and driven by the shared view helper", () => {
  const source = read("src/components/auth/PasswordStrengthMeter.jsx");
  assert.match(
    source,
    /getPasswordStrengthView/,
    "meter should render from the shared presentation helper"
  );
  assert.doesNotMatch(
    source,
    /validatePassword|passwordPolicy/,
    "meter must not import or re-run the shared validator"
  );
});

test("screen-reader live region is only the short strength label", () => {
  const source = read("src/components/auth/PasswordStrengthMeter.jsx");

  // Outer wrapper carries neither role="status" nor aria-label.
  const returnAt = source.indexOf("return (");
  assert.ok(returnAt !== -1, "meter should return JSX");
  const outerTag = source.slice(returnAt, source.indexOf(">", returnAt) + 1);
  assert.doesNotMatch(outerTag, /role="status"/, "outer wrapper must not be a status role");
  assert.doesNotMatch(outerTag, /aria-label/, "outer wrapper must not carry an aria-label");

  // Exactly one live region, on the <p> that shows the visible label.
  const statusRoles = source.match(/role="status"/g) ?? [];
  assert.equal(statusRoles.length, 1, "meter should declare role=status exactly once");
  const textAt = source.indexOf("Password strength:");
  assert.ok(textAt !== -1, "meter keeps the visible Password strength: <label> text");
  const pStart = source.lastIndexOf("<p", textAt);
  assert.ok(pStart !== -1, "visible label should be a <p> element");
  const pTag = source.slice(pStart, source.indexOf(">", pStart) + 1);
  assert.match(pTag, /role="status"/, "live region belongs on the strength label");
  assert.match(pTag, /aria-live="polite"/, "live region should announce politely");
  assert.match(pTag, /aria-atomic="true"/, "live region should announce as a whole");

  // The checklist sits outside that live region.
  const pEnd = source.indexOf("</p>", textAt);
  const ulAt = source.indexOf("<ul");
  assert.ok(ulAt > pEnd, "checklist must render after the live region closes");
});

test("meter passes the password to the view helper for display-only flags", () => {
  const source = read("src/components/auth/PasswordStrengthMeter.jsx");
  assert.match(
    source,
    /getPasswordStrengthView\(check,\s*password\)/,
    "meter should pass password for visible character-type flags"
  );
});

test("meter root div accepts id, check, and display-only password props", () => {
  const source = read("src/components/auth/PasswordStrengthMeter.jsx");
  assert.match(
    source,
    /function PasswordStrengthMeter\(\{\s*id,\s*check(?:\s*=\s*null)?,\s*password/,
    "meter should accept id, check, and password props"
  );
  const returnAt = source.indexOf("return (");
  assert.ok(returnAt !== -1, "meter should return JSX");
  const outerTag = source.slice(returnAt, source.indexOf(">", returnAt) + 1);
  assert.match(outerTag, /id=\{id\}/, "root div should forward the id prop");
});

test("checklist renders as a compact two-column grid", () => {
  const source = read("src/components/auth/PasswordStrengthMeter.jsx");
  const ulAt = source.indexOf("<ul");
  assert.ok(ulAt !== -1, "meter renders a checklist");
  const ulTag = source.slice(ulAt, source.indexOf(">", ulAt) + 1);
  assert.match(ulTag, /grid-cols-2/, "checklist should use a two-column grid");
  assert.doesNotMatch(ulTag, /sm:grid-cols-2/, "checklist should not stay one-column on mobile");
  assert.doesNotMatch(ulTag, /grid-cols-1/, "checklist should not fall back to one column");
});
