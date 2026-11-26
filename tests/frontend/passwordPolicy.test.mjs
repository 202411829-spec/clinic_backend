import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { validatePassword, PASSWORD_REQUIREMENTS_MESSAGE } from "../../src/lib/passwordPolicy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.join(here, "..", "password_policy_vectors.json"), "utf8")
);

async function loadAuthPasswordErrors() {
  return import("../../src/lib/authPasswordErrors.js");
}

for (const vector of vectors) {
  test(`password policy: ${vector.name}`, () => {
    const password = vector.password ?? vector.passwordRepeat.repeat(vector.repeat) + (vector.passwordSuffix ?? "");
    const result = validatePassword(password, {
      email: vector.email,
      username: vector.username,
    });

    assert.equal(result.valid, vector.valid);
    assert.equal(result.code, vector.code);
    assert.equal(result.strength, vector.strength);
  });
}

test("password requirements message explains the UTF-8 byte limit", () => {
  assert.match(PASSWORD_REQUIREMENTS_MESSAGE, /12 characters/i);
  assert.match(PASSWORD_REQUIREMENTS_MESSAGE, /3 of 4/i);
  assert.match(PASSWORD_REQUIREMENTS_MESSAGE, /72 UTF-8 bytes/i);
  assert.match(PASSWORD_REQUIREMENTS_MESSAGE, /accented characters and emoji/i);
  assert.doesNotMatch(PASSWORD_REQUIREMENTS_MESSAGE, /password123/i);
});

test("weak-password code maps to a friendly message without provider details", async () => {
  const { friendlyPasswordError, WEAK_PASSWORD_MESSAGE } = await loadAuthPasswordErrors();
  const result = friendlyPasswordError({
    code: "weak_password",
    message: "Weak password: pwned password from Supabase",
  });

  assert.equal(result, WEAK_PASSWORD_MESSAGE);
  assert.doesNotMatch(result, /weak_password|pwned|supabase/i);
});

test("password validation messages map to the same friendly message", async () => {
  const { friendlyPasswordError, WEAK_PASSWORD_MESSAGE } = await loadAuthPasswordErrors();
  const errors = [
    { message: "Password cannot be longer than 72 bytes" },
    { message: "Password should be at least 12 characters" },
    { code: "validation_failed", message: "Error validating user: password too weak" },
  ];

  for (const error of errors) {
    assert.equal(friendlyPasswordError(error), WEAK_PASSWORD_MESSAGE);
  }
});

test("unrelated auth errors keep their existing message", async () => {
  const { friendlyPasswordError } = await loadAuthPasswordErrors();

  assert.equal(
    friendlyPasswordError({ message: "Invalid or expired verification code." }, "Fallback"),
    "Invalid or expired verification code."
  );
  assert.equal(friendlyPasswordError(null, "Fallback"), "Fallback");
});

test("signup and reset flows use the friendly password error helper", () => {
  const files = [
    "../../src/components/auth/StudentSignUpForm.jsx",
    "../../src/pages/auth/AdminSignUp.jsx",
    "../../src/components/auth/ForgotPasswordForm.jsx",
    "../../src/pages/auth/StudentSignUp.jsx",
  ];

  for (const file of files) {
    const source = readFileSync(path.join(here, file), "utf8");
    assert.match(source, /friendlyPasswordError/);
  }
});

test("forgot form normalizes email before password policy validation", () => {
  const source = readFileSync(
    path.join(here, "../../src/components/auth/ForgotPasswordForm.jsx"),
    "utf8"
  );
  assert.match(source, /setEmail\(target\)/);
});

test("login components do not import password policy or error helper", () => {
  const files = [
    "../../src/components/auth/StudentLoginForm.jsx",
    "../../src/components/auth/LoginForm.jsx",
    "../../src/pages/auth/StudentLogin.jsx",
    "../../src/pages/auth/AdminLogin.jsx",
    "../../src/lib/supabaseClient.js",
  ];

  for (const file of files) {
    const source = readFileSync(path.join(here, file), "utf8");
    assert.doesNotMatch(source, /validatePassword|passwordPolicy|authPasswordErrors|friendlyPasswordError/);
  }
});
