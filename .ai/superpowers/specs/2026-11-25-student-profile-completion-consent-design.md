# Student Profile Completion + Data Privacy Consent Design

Date: 2026-11-25
Status: Approved design; implemented in the working tree with final automated verification completed. Live relogin verification remains blocked without a local/dev incomplete test-student credential; no production accounts or real student data were used.
Spec is intentionally not committed because the user requested no staging or commits.

## Objective

Make the existing student onboarding flow enforce Data Privacy consent as a persistent, backend-owned part of profile completion. Incomplete students must land directly in the existing Edit Student Information form and remain there until all required fields and Data Privacy consent are saved. After a successful final submission, they must go to the Student Dashboard. Completed students must go directly to the dashboard on future logins and across devices.

## Current behavior

- `src/pages/auth/StudentLogin.jsx:17` always navigates to `/student/dashboard`.
- `src/layouts/StudentLayout.jsx:94-100` redirects incomplete students to `/student/profile`, a read-only record page where they must manually click “Edit information”.
- The edit UI is transient state in `src/components/student/StudentRecordPanel.jsx:62,174-187`; there is no dedicated edit URL.
- `EditStudentInfoModal.jsx` already has three steps: Personal Information, Medical History, and Data Privacy. Consent is only local checkbox state; it is not persisted and is not sent in the PATCH payload.
- `src/lib/profileCompleteness.js:25-49` derives completeness from nine required fields plus an emergency contact. It explicitly excludes consent.
- No SQL column, backend flag, or endpoint currently stores Data Privacy consent.

## Chosen approach

Use a nullable timestamp on `students`, approved as Approach A.

Rejected alternatives:

- Boolean column: the current `isFilled()` helper treats boolean `false` as filled, so it would require extra helper changes and has no audit timestamp.
- Separate consent table/endpoint: more schema and API surface than one persistent flag requires.

## Data model and migration

New migration: `migrations/2026-11-25_student_data_privacy_consent.sql`.

Requirements:

1. Add the column idempotently:

   ```sql
   ALTER TABLE "students"
     ADD COLUMN IF NOT EXISTS "data_privacy_consented_at" timestamptz;
   ```

2. Recreate `student_masterlist` from the exact current definition in `migrations/2026-08-28_clean_rebuild_ddl.sql:534-556`, preserving all joins, filters, aliases, and output columns, and append:

   ```sql
   s."data_privacy_consented_at"
   ```

3. Include `NOTIFY pgrst, 'reload schema';` after the view is recreated.

4. Do not add a default, backfill existing rows, change RLS, change grants, seed data, run clean rebuild DDL, or run reset scripts. Existing students keep `NULL` until they explicitly consent.

5. Migration application rule: first verify the target environment and current migration state. Apply only this additive migration. If the target environment cannot be confirmed, stop and report instead of guessing.

Rollback: restore the exact previous `student_masterlist` definition first, then drop the column. Never roll back by rerunning clean rebuild or seed scripts.

## Backend API behavior

Change only `routers/student_record.py`, inside the existing `PATCH /api/records/<student_id>/profile` flow.

### Ownership

- Keep the current ownership behavior for ordinary profile fields: students may edit only themselves; admins keep the existing bypass for ordinary fields.
- Consent is owner-only. The admin bypass must not allow an admin to consent on behalf of another student.
- The student ID must come from the authenticated token via the existing resolver, not from the request body.

### Consent request shape

- Accept only a top-level request key `data_privacy_consent`.
- Only Python `True` counts as explicit consent.
- `false`, `null`, strings, missing key, or any other value means “no consent write.”
- Existing PATCH payloads without the key continue to work unchanged.

### Write semantics

- Ordinary profile, emergency contact, and medical history updates happen first.
- If any ordinary update fails, return an error and do not write consent.
- Consent is written last using a server-side UTC timestamp, never a client timestamp.
- The write must be atomic and non-overwriting:

  ```sql
  UPDATE "students"
     SET "data_privacy_consented_at" = <server_utc_now>
   WHERE "student_id" = <authenticated_owner_student_id>
     AND "data_privacy_consented_at" IS NULL
  ```

- If the row already has a non-null timestamp, do not update it; the first successful consent timestamp is preserved.
- If the consent write fails, return an error rather than success.
- The PATCH response echo and `GET /api/records/<student_id>/medical-summary` automatically include the new field through `student_masterlist`; no separate response field is added.

### GET authorization

`GET /api/records/<student_id>/medical-summary` authorization remains unchanged in this task. Adding owner-or-admin scoping to that GET is explicitly deferred as a future security improvement and must be recorded in the spec and progress log.

## Frontend behavior

### Completion status

- `src/lib/profileCompleteness.js`: add `data_privacy_consented_at` to `REQUIRED_PROFILE_FIELDS`.
- Keep all existing required fields and validation behavior.
- `ProfileCompletenessContext` continues to be the status source; the new column arrives in the existing profile/summary payloads.
- Completing Personal Information or Medical History alone cannot mark the profile complete because the consent timestamp remains `NULL`.

### Existing edit form

- Keep the existing three-step `EditStudentInfoModal`, consent wording, checkbox behavior, required-field checks, and save API.
- On final Data Privacy submit only, add top-level `data_privacy_consent: true` to the existing PATCH payload after `form.consent` is true.
- Do not add the consent key in Personal Information or Medical History steps.
- `buildSafeProfilePatch` strips only nested `emergency_contact`/`medical_history` sections, so the top-level consent key survives.

### Onboarding route and guard

- Add a thin `/student/profile/edit` route that reuses `EditStudentInfoModal` in an onboarding mode.
- Reuse the existing save flow; if extraction is needed, extract the current save callback into a small helper without behavior changes.
- In onboarding mode, hide the back/exit path so the student cannot leave the form manually.
- `StudentLayout` keeps the loader while status is `checking`, preventing dashboard flashes.
- When status is `incomplete`, redirect every student path except `/student/profile/edit` to `/student/profile/edit` using `replace`.
- After final PATCH success, update the completion context from the returned profile first. Only if that returned profile indicates consent was recorded and all required fields are present, navigate to `/student/dashboard`. Otherwise remain in onboarding and show the existing save/error behavior.
- When status is `complete`, allow normal student pages and the dashboard with no redirect.

### Out of scope

- No login form/page changes.
- No admin route or admin behavior changes.
- No GET authorization hardening in this task.
- No new wizard, new save API, or unrelated refactor.
- No localStorage or frontend checkbox as the completion source of truth.

## Tests

### Backend

Add focused Python tests, following the fake-query/monkeypatch style in `tests/test_appointment_reschedule.py`, for:

- Owner student with `data_privacy_consent: true` records a server timestamp.
- Non-owner student receives 403 and cannot set another student’s consent.
- Admin cannot set consent for another student, while ordinary admin profile behavior remains unchanged.
- `false`, `null`, strings, and missing key do not write consent.
- Existing non-null consent timestamp is not overwritten; concurrent-safe conditional update is used.
- Ordinary profile update failure prevents consent from being recorded.
- Consent write failure returns an error, not success.
- PATCH echo and medical-summary payload expose `data_privacy_consented_at`.

### Frontend

Add focused Node tests for:

- `isStudentProfileComplete()` is false without `data_privacy_consented_at` and true with it plus all existing required fields.
- Only final Data Privacy submission includes `data_privacy_consent: true`.
- `/student/profile/edit` route exists and uses the existing modal in onboarding mode.
- `StudentLayout` redirects incomplete students to the edit route with `replace` and keeps the checking loader.
- Context is updated from the PATCH response before dashboard navigation.
- Login files remain unchanged and free of new storage/consent logic.

### Migration and verification

- Verify migration idempotency and exact view preservation.
- Verify target environment and migration state before applying; apply only the new additive migration.
- Run relevant backend tests.
- Run relevant frontend tests.
- Run full frontend tests: `node --test "tests/frontend/*.test.mjs"`.
- Run Vite build: `npm run build`.
- Run `git diff --check`.
- Preserve uncommitted work; do not stage or commit.

## Success criteria

1. Incomplete login lands visibly on the existing Edit Student Information form, not the dashboard.
2. Incomplete students cannot access the dashboard or other protected student pages.
3. Personal Information and Medical History saves alone do not unlock the portal.
4. Successful Data Privacy submission records the backend timestamp and redirects to `/student/dashboard`.
5. Completed students go directly to `/student/dashboard` on future logins and other devices.
6. Refresh, navigation attempts, and relogin preserve the correct completion state.
7. No redirect loop occurs after completion.
8. Admin flows, login/authentication behavior, consent wording, and unrelated features are unchanged.
9. Target environment ambiguity stops migration application rather than guessing.

## Deferred security improvement

Owner-or-admin authorization for `GET /api/records/<student_id>/medical-summary` is deliberately out of scope. It should be handled in a separate security-focused change because the endpoint currently allows any authenticated caller to read any student summary.
