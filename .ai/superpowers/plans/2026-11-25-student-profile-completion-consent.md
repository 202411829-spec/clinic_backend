# Student Profile Completion + Data Privacy Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist student Data Privacy consent in the backend and use it with the existing required-field validation to gate the student portal.

**Architecture:** Add an idempotent migration for `students.data_privacy_consented_at` and expose it through `student_masterlist`. Extend the existing profile PATCH so only the authenticated owner can write a server-side, non-overwriting consent timestamp. Add the field to derived completeness, create an onboarding edit route that reuses the existing form, and redirect incomplete students there until the PATCH echo proves the profile is complete.

**Tech Stack:** Flask blueprints, Supabase PostgREST, pytest, React 19, React Router, Vite, Node test runner.

**Spec:** `.ai/superpowers/specs/2026-11-25-student-profile-completion-consent-design.md`

## Global Constraints

- Preserve all existing uncommitted changes.
- Do not stage, commit, push, reset, or revert.
- Do not run clean rebuild DDL, seed scripts, backfill, data resets, RLS changes, or grant changes.
- Apply only the new additive migration after confirming the target environment and migration state.
- Expected Supabase project ref: `vqhydemespcbqgjpnoap`. If it cannot be confirmed, stop and report.
- Existing students keep `NULL` consent until they explicitly consent.
- Consent is written only after the ordinary profile updates succeed.
- Consent must never overwrite an existing non-null timestamp.
- Consent writes are owner-only; admin bypass applies only to ordinary profile fields.
- `GET /api/records/<student_id>/medical-summary` authorization stays unchanged.
- Do not change login files, admin routes, consent wording, checkbox behavior, or unrelated features.
- Full frontend test command is `node --test "tests/frontend/*.test.mjs"` on Node `v24.12.0`.
- Use direct Git at `C:\Program Files\Git\cmd\git.exe` for Git checks.

## File Structure

| File | Responsibility |
|---|---|
| `migrations/2026-11-25_student_data_privacy_consent.sql` | Add the nullable timestamp and append it to `student_masterlist`. |
| `tests/test_privacy_migration_contract.py` | Static checks that the migration stays additive, idempotent, and view-preserving. |
| `routers/student_record.py` | Owner-only consent write inside the existing profile PATCH. |
| `tests/test_student_record_consent.py` | Backend behavior tests for consent ownership, atomicity, failure handling, and response echo. |
| `src/lib/profileCompleteness.js` | Derived completeness now requires `data_privacy_consented_at`. |
| `src/context/ProfileCompletenessContext.jsx` | Comment only: source of truth now includes persistent consent. |
| `tests/frontend/studentProfileCompletion.test.mjs` | Pure completeness tests plus source-contract checks. |
| `src/lib/studentProfileEditPayload.js` | Optional top-level `data_privacy_consent: true` on final submit only. |
| `src/lib/studentProfileSave.js` | Shared PATCH/apply-profile helper extracted without behavior change. |
| `src/components/student/EditStudentInfoModal.jsx` | Pass final consent flag into payload builder; hide exit Back link in onboarding mode. |
| `src/components/student/StudentRecordPanel.jsx` | Use shared save helper; preserve existing normal edit behavior. |
| `tests/frontend/studentProfileEditPayload.test.mjs` | Extend existing payload tests for consent flag. |
| `tests/frontend/studentProfileSave.test.mjs` | Verify PATCH echo is applied before callers navigate. |
| `src/pages/student/ProfileEdit.jsx` | Thin onboarding page reusing the existing edit modal. |
| `src/router/lazyPages.js` | Lazy-load the new onboarding page. |
| `src/router/index.jsx` | Add `/student/profile/edit` under the protected student branch. |
| `src/layouts/StudentLayout.jsx` | Redirect incomplete students to the edit route with `replace`. |
| `tests/frontend/studentProfileOnboarding.test.mjs` | Source-contract tests for route, guard, modal mode, and navigation order. |

---

### Task 1: Additive consent migration

**Files:**
- Create: `migrations/2026-11-25_student_data_privacy_consent.sql`
- Test: `tests/test_privacy_migration_contract.py`

**Interfaces:**
- Consumes: exact current `student_masterlist` definition in `migrations/2026-08-28_clean_rebuild_ddl.sql:534-556`.
- Produces: `students.data_privacy_consented_at` and `student_masterlist.data_privacy_consented_at`, both nullable with no default.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/test_privacy_migration_contract.py` with exactly:

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_student_data_privacy_consent.sql"


def test_consent_migration_is_additive_idempotent_and_view_preserving():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'ALTER TABLE "students"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "data_privacy_consented_at" timestamptz;' in sql
    assert 'CREATE OR REPLACE VIEW "student_masterlist" AS' in sql
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    required_view_lines = [
        '  s."student_id",',
        '  s."last_name",',
        '  s."first_name",',
        '  s."middle_initial",',
        '   (s."last_name" || \', \' || s."first_name"',
        '      || COALESCE(\' \' || left(s."middle_initial", 1) || \'.\', \'\')) AS "full_name",',
        '  d."department_id",',
        '  d."department_name",',
        '  c."course_id",',
        '  c."course_name",',
        '  s."year_level",',
        '  s."gender",',
        '  s."birth_date",',
        '   date_part(\'year\', age(s."birth_date"))::integer AS "age",',
        '  s."contact_number",',
        '  s."email",',
        '  s."civil_status",',
        '  s."present_address",',
        '  s."data_privacy_consented_at"',
        'FROM "students" s',
        'LEFT JOIN "departments" d ON d."department_id" = s."department_id"',
        'LEFT JOIN "courses" c ON c."course_id" = s."course_id";',
    ]
    for line in required_view_lines:
        assert line in sql, f"missing preserved view line: {line}"

    forbidden = [
        "DROP TABLE",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "students"',
        "ENABLE ROW LEVEL SECURITY",
        "GRANT ",
        "2026-08-28_clean_rebuild_ddl.sql",
        "2026-08-28_clean_seed.sql",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_privacy_migration_contract.py -q`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the migration**

Create `migrations/2026-11-25_student_data_privacy_consent.sql` with exactly:

```sql
-- Additive migration: persistent Data Privacy consent.
-- Existing students remain NULL until they explicitly consent.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "data_privacy_consented_at" timestamptz;

CREATE OR REPLACE VIEW "student_masterlist" AS
SELECT
  s."student_id",
  s."last_name",
  s."first_name",
  s."middle_initial",
  (s."last_name" || ', ' || s."first_name"
     || COALESCE(' ' || left(s."middle_initial", 1) || '.', '')) AS "full_name",
  d."department_id",
  d."department_name",
  c."course_id",
  c."course_name",
  s."year_level",
  s."gender",
  s."birth_date",
  date_part('year', age(s."birth_date"))::integer AS "age",
  s."contact_number",
  s."email",
  s."civil_status",
  s."present_address",
  s."data_privacy_consented_at"
FROM "students" s
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "courses" c ON c."course_id" = s."course_id";

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_privacy_migration_contract.py -q`

Expected: PASS, `1 passed`.

- [ ] **Step 5: Verify target environment and current migration state**

Run from the repo root:

```powershell
python -c "from pathlib import Path; vals={}; [vals.setdefault(k,v.strip()) for line in Path('.env').read_text(errors='ignore').splitlines() if '=' in line and not line.lstrip().startswith('#') for k,v in [line.split('=',1)]]; url=vals['SUPABASE_URL']; print('target_ok=' + str('vqhydemespcbqgjpnoap' in url))"
```

Expected: `target_ok=True`. If it prints `False`, stop and report; do not apply anything.

Then run:

```powershell
python -c "from pathlib import Path; from urllib.request import Request, urlopen; from urllib.error import HTTPError; vals={}; [vals.setdefault(k,v.strip()) for line in Path('.env').read_text(errors='ignore').splitlines() if '=' in line and not line.lstrip().startswith('#') for k,v in [line.split('=',1)]]; url=vals['SUPABASE_URL'].rstrip('/'); key=vals['SUPABASE_SERVICE_ROLE_KEY']; headers={'apikey':key,'Authorization':'Bearer '+key}; tables=['students','student_masterlist']; check=lambda t: (urlopen(Request(url+'/rest/v1/'+t+'?select=data_privacy_consented_at&limit=1',headers=headers),timeout=15).status); print({t:('present' if check(t)==200 else 'unexpected') for t in tables})"
```

Expected: both tables report `present`. If either raises `HTTPError` with an unknown-column message, the migration is not applied yet. If any other error occurs, stop and report; do not guess.

- [ ] **Step 6: Apply the migration only through a confirmed SQL path**

Run:

```powershell
Get-Command psql,supabase -ErrorAction SilentlyContinue | Select-Object Name,Source
```

Expected outcomes:

- If a SQL client is available and its target is confirmed as project `vqhydemespcbqgjpnoap`, apply only `migrations/2026-11-25_student_data_privacy_consent.sql`.
- If no confirmed SQL path exists, stop and tell the user to run that one SQL file in the Supabase SQL editor. Do not run clean rebuild or seed scripts.

After application, rerun the Step 5 probe and require both tables to report `present`.

---

### Task 2: Consent write in profile PATCH

**Files:**
- Modify: `routers/student_record.py:10-18`, `routers/student_record.py:606-722`
- Test: `tests/test_student_record_consent.py`

**Interfaces:**
- Consumes: authenticated `g.user`, `resolve_student_id`, `is_admin_user`, and `execute_with_retry`.
- Produces: `PATCH /api/records/<student_id>/profile` accepts optional top-level `data_privacy_consent: true` and writes `students.data_privacy_consented_at`.

- [ ] **Step 1: Write the failing backend tests**

Create `tests/test_student_record_consent.py` with exactly:

```python
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from main import app

STUDENT_ID = "202311330"
OTHER_STUDENT_ID = "202311331"
FIRST_CONSENT_AT = "2026-11-25T10:00:00+00:00"


class FakeResponse:
    def __init__(self, data=None, error=None):
        self.data = data if data is not None else []
        self.error = error
        self.count = len(self.data)


class FakeQuery:
    def __init__(self, table):
        self.table = table
        self.operation = None
        self.payload = None
        self.filters = []

    def select(self, *fields):
        self.operation = "select"
        self.fields = fields
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def eq(self, field, value):
        self.filters.append((field, "eq", value))
        return self

    def is_(self, field, value):
        self.filters.append((field, "is", value))
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        return self


@pytest.fixture
def consent_env():
    writes = []
    student_row = {"student_id": STUDENT_ID, "data_privacy_consented_at": None}
    profile_row = {
        "student_id": STUDENT_ID,
        "first_name": "Juan",
        "last_name": "Dela Cruz",
        "data_privacy_consented_at": None,
    }
    ordinary_update_error = {"value": None}
    consent_update_error = {"value": None}
    ordinary_update_fails = {"value": False}

    def fake_execute(query):
        nonlocal profile_row

        if query.operation == "select" and query.table == "students":
            return FakeResponse([dict(student_row)])

        if query.operation == "select" and query.table == "student_masterlist":
            return FakeResponse([dict(profile_row)])

        if query.operation == "select" and query.table in (
            "emergency_contacts",
            "medical_histories",
        ):
            return FakeResponse([])

        if query.operation == "update" and query.table == "students":
            payload = dict(query.payload)
            writes.append({"payload": payload, "filters": list(query.filters)})

            if "data_privacy_consented_at" in payload:
                if consent_update_error["value"]:
                    return FakeResponse(error=consent_update_error["value"])
                if student_row["data_privacy_consented_at"] is None:
                    student_row["data_privacy_consented_at"] = payload[
                        "data_privacy_consented_at"
                    ]
                    profile_row["data_privacy_consented_at"] = payload[
                        "data_privacy_consented_at"
                    ]
                return FakeResponse([dict(student_row)])

            if ordinary_update_fails["value"]:
                return FakeResponse(
                    error=ordinary_update_error["value"] or RuntimeError("db error")
                )
            return FakeResponse([dict(student_row)])

        if query.operation == "update" and query.table in (
            "emergency_contacts",
            "medical_histories",
        ):
            writes.append({"payload": dict(query.payload), "filters": list(query.filters)})
            return FakeResponse([{}])

        if query.operation == "insert" and query.table in (
            "emergency_contacts",
            "medical_histories",
        ):
            writes.append({"payload": dict(query.payload), "filters": list(query.filters)})
            return FakeResponse([{}])

        return FakeResponse()

    patches = [
        patch(
            "routers.auth_guard._verify_token",
            return_value=SimpleNamespace(
                id="auth-student", email=f"{STUDENT_ID}@gordoncollege.edu.ph"
            ),
        ),
        patch("routers.student_record.supabase"),
        patch("routers.student_record.execute_with_retry", side_effect=fake_execute),
        patch("routers.student_record.is_admin_user", return_value=False),
        patch("routers.student_record.resolve_student_id", return_value=STUDENT_ID),
    ]
    started = [p.start() for p in patches]
    started[1].table.side_effect = lambda name: FakeQuery(name)

    app.config["TESTING"] = True
    client = app.test_client()

    yield {
        "client": client,
        "writes": writes,
        "student_row": student_row,
        "profile_row": profile_row,
        "ordinary_update_fails": ordinary_update_fails,
        "ordinary_update_error": ordinary_update_error,
        "consent_update_error": consent_update_error,
    }

    for p in reversed(patches):
        p.stop()


def patch_profile(client, payload):
    return client.patch(
        f"/api/records/{STUDENT_ID}/profile",
        json=payload,
        headers={"Authorization": "Bearer fake"},
    )


def consent_writes(writes):
    return [
        w for w in writes
        if "data_privacy_consented_at" in w["payload"]
    ]


def test_owner_true_consent_records_server_timestamp_and_echoes_it(consent_env):
    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["data"]["profile"]["data_privacy_consented_at"]

    writes = consent_writes(consent_env["writes"])
    assert len(writes) == 1
    assert ("data_privacy_consented_at", "is", None) in writes[0]["filters"]
    assert ("student_id", "eq", STUDENT_ID) in writes[0]["filters"]
    assert writes[0]["payload"]["data_privacy_consented_at"].endswith("+00:00")


def test_existing_consent_is_not_overwritten(consent_env):
    consent_env["student_row"]["data_privacy_consented_at"] = FIRST_CONSENT_AT
    consent_env["profile_row"]["data_privacy_consented_at"] = FIRST_CONSENT_AT

    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 200
    assert consent_env["student_row"]["data_privacy_consented_at"] == FIRST_CONSENT_AT
    writes = consent_writes(consent_env["writes"])
    assert len(writes) == 1
    assert ("data_privacy_consented_at", "is", None) in writes[0]["filters"]


def test_non_owner_student_cannot_consent(consent_env):
    with patch("routers.student_record.resolve_student_id", return_value=OTHER_STUDENT_ID):
        response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 403
    assert consent_writes(consent_env["writes"]) == []


def test_admin_cannot_consent_for_another_student(consent_env):
    with patch("routers.student_record.is_admin_user", return_value=True), patch(
        "routers.student_record.resolve_student_id", return_value=None
    ):
        response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 403
    assert consent_writes(consent_env["writes"]) == []


def test_admin_without_consent_still_edits_ordinary_profile(consent_env):
    with patch("routers.student_record.is_admin_user", return_value=True), patch(
        "routers.student_record.resolve_student_id", return_value=None
    ):
        response = patch_profile(consent_env["client"], {"first_name": "Pedro"})

    assert response.status_code == 200
    assert consent_writes(consent_env["writes"]) == []
    assert any(
        w["payload"] == {"first_name": "Pedro"} for w in consent_env["writes"]
    )


@pytest.mark.parametrize("value", [False, None, "true", 1, []])
def test_non_true_consent_values_do_not_write_consent(consent_env, value):
    response = patch_profile(consent_env["client"], {"data_privacy_consent": value})

    assert response.status_code == 200
    assert consent_writes(consent_env["writes"]) == []


def test_ordinary_update_failure_prevents_consent(consent_env):
    consent_env["ordinary_update_fails"]["value"] = True

    response = patch_profile(
        consent_env["client"],
        {"first_name": "Pedro", "data_privacy_consent": True},
    )

    assert response.status_code == 500
    assert consent_writes(consent_env["writes"]) == []


def test_consent_write_failure_returns_error(consent_env):
    consent_env["consent_update_error"]["value"] = RuntimeError("consent failed")

    response = patch_profile(consent_env["client"], {"data_privacy_consent": True})

    assert response.status_code == 500
    assert response.get_json()["success"] is False
    assert response.get_json()["error"] == "Failed to save data privacy consent"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_student_record_consent.py -q`

Expected: FAIL because the route does not understand `data_privacy_consent` and the failure tests cannot find consent writes.

- [ ] **Step 3: Add timestamp and DB-error helpers**

In `routers/student_record.py`, replace:

```python
from datetime import date
```

with:

```python
from datetime import date, datetime, timezone
```

Add these helpers after `_error`:

```python
def _ensure_db_ok(response, message):
    error = getattr(response, "error", None)
    if error:
        logger.error("%s: %s", message, getattr(error, "message", error))
        raise RuntimeError(message)


def _record_data_privacy_consent(student_id):
    timestamp = datetime.now(timezone.utc).isoformat()
    response = execute_with_retry(
        supabase.table("students")
        .update({"data_privacy_consented_at": timestamp})
        .eq("student_id", student_id)
        .is_("data_privacy_consented_at", None)
    )
    _ensure_db_ok(response, "Failed to save data privacy consent")
```

- [ ] **Step 4: Replace ownership logic**

In `update_student_profile`, replace lines `616-637` with:

```python
    # --- Ownership check ---
    # `g.user` is a dict {id, email}; the auth_guard resolvers expect an
    # object with .id/.email attributes (feedback.py pattern).
    auth_user = SimpleNamespace(
        id=g.user.get("id"),
        email=g.user.get("email"),
    )
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return _error("Invalid request body", 400)

    consent_requested = body.get("data_privacy_consent") is True
    caller_student_id = resolve_student_id(auth_user)
    is_owner = (
        caller_student_id is not None
        and normalize_student_id(caller_student_id) == sid
    )
    is_admin = is_admin_user(auth_user)

    # Admins keep the existing bypass for ordinary fields. Consent never
    # uses that bypass: only the owner student may record their own consent.
    if not is_admin and not is_owner:
        return _error("You can only edit your own profile", 403)
    if consent_requested and not is_owner:
        return _error("You can only submit your own data privacy consent", 403)
```

- [ ] **Step 5: Replace ordinary update block and add consent write**

In `update_student_profile`, replace the block from `body = request.get_json(silent=True) or {}` through the end of the medical-history upsert (current lines `649-693`) with:

```python
    # --- Update students table (partial) ---
    student_payload = {}
    for key in _STUDENT_EDITABLE_FIELDS:
        if key in body:
            value = body[key]
            if key in _DATE_FIELDS:
                value = _iso_or_none(value)
            student_payload[key] = value

    try:
        if student_payload:
            _ensure_db_ok(
                execute_with_retry(
                    supabase.table("students")
                    .update(student_payload)
                    .eq("student_id", sid)
                ),
                "Failed to update profile",
            )

        # --- Upsert emergency_contact ---
        ec_body = body.get("emergency_contact")
        if ec_body and isinstance(ec_body, dict):
            ec_payload = {}
            for key in ("contact_name", "relationship", "phone_number", "present_address"):
                if key in ec_body:
                    ec_payload[key] = ec_body[key]
            if ec_payload:
                _ensure_db_ok(
                    _upsert_by_student_id("emergency_contacts", sid, ec_payload),
                    "Failed to save emergency contact",
                )

        # --- Upsert medical_history ---
        mh_body = body.get("medical_history")
        if mh_body and isinstance(mh_body, dict):
            mh_payload = {}
            for key in _MEDICAL_HISTORY_BOOL_FIELDS:
                if key in mh_body:
                    mh_payload[key] = bool(mh_body[key])
            for key in _MEDICAL_HISTORY_OTHER_FIELDS:
                if key in mh_body:
                    value = mh_body[key]
                    if key == "operation_date":
                        value = _iso_or_none(value)
                    elif key == "has_operation_history":
                        value = bool(value)
                    mh_payload[key] = value
            if mh_payload:
                _ensure_db_ok(
                    _upsert_by_student_id("medical_histories", sid, mh_payload),
                    "Failed to save medical history",
                )

        # Consent is last. The conditional .is_(..., None) update preserves
        # the first successful timestamp even under concurrent submissions.
        if consent_requested:
            _record_data_privacy_consent(sid)
    except RuntimeError as exc:
        return _error(str(exc), 500)
    except Exception:
        logger.exception("Unhandled error while saving student profile")
        return _error("Failed to save profile", 500)
```

- [ ] **Step 6: Run the backend tests**

Run: `python -m pytest tests/test_student_record_consent.py -q`

Expected: PASS. If the two failure-path tests are brittle, simplify only those two tests to patch `routers.student_record.execute_with_retry` with a fake that delegates to the fixture `fake_execute` stored on the fixture object; do not weaken the assertions that no consent write occurs and the status is 500.

- [ ] **Step 7: Run adjacent backend tests**

Run: `python -m pytest tests/test_appointment_reschedule.py tests/test_student_record_consent.py -q`

Expected: PASS with no regressions in the existing appointment flow.

---

### Task 3: Require persistent consent in derived completeness

**Files:**
- Modify: `src/lib/profileCompleteness.js:1-49`
- Modify: `src/context/ProfileCompletenessContext.jsx:1-12`
- Test: `tests/frontend/studentProfileCompletion.test.mjs`

**Interfaces:**
- Consumes: `recordData` shaped like `{ profile, emergency_contact, ... }`.
- Produces: `isStudentProfileComplete(recordData)` now returns `false` until `profile.data_privacy_consented_at` is non-null.

- [ ] **Step 1: Write the failing completeness tests**

Create `tests/frontend/studentProfileCompletion.test.mjs` with:

```javascript
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

import { isStudentProfileComplete } from "../../src/lib/profileCompleteness.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) =>
  readFileSync(path.join(here, "..", "..", relativePath), "utf8")

const PROFILE = {
  first_name: "Juan",
  last_name: "Dela Cruz",
  gender: "Male",
  birth_date: "2004-02-05",
  civil_status: "Single",
  contact_number: "09123456789",
  present_address: "Gordon College",
  department_id: 1,
  course_id: 2,
  data_privacy_consented_at: "2026-11-25T10:00:00+00:00",
}

const RECORD = {
  profile: PROFILE,
  emergency_contact: { contact_name: "Maria" },
}

test("complete record requires persistent data privacy consent", () => {
  assert.equal(isStudentProfileComplete(RECORD), true)

  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, data_privacy_consented_at: null },
    }),
    false
  )
  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, data_privacy_consented_at: undefined },
    }),
    false
  )
})

test("consent alone does not replace missing required fields", () => {
  assert.equal(
    isStudentProfileComplete({
      ...RECORD,
      profile: { ...PROFILE, department_id: null },
    }),
    false
  )
  assert.equal(
    isStudentProfileComplete({ profile: PROFILE }),
    false
  )
})

test("profileCompleteness source names the consent timestamp", () => {
  const source = read("src/lib/profileCompleteness.js")
  assert.match(source, /"data_privacy_consented_at"/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "tests/frontend/studentProfileCompletion.test.mjs"`

Expected: FAIL because `data_privacy_consented_at` is not required yet.

- [ ] **Step 3: Add the field to required fields**

In `src/lib/profileCompleteness.js`, replace the header comment lines `4-8` with:

```javascript
// Completeness is deliberately derived from persistent backend fields: every
// required profile field, an emergency contact, and a non-null
// `data_privacy_consented_at` timestamp written only after the student's
// explicit final submission. The consent checkbox itself is not the source
// of truth; the persisted timestamp is.
```

Replace:

```javascript
  "course_id",
];
```

with:

```javascript
  "course_id",
  "data_privacy_consented_at",
];
```

- [ ] **Step 4: Update context comments only**

In `src/context/ProfileCompletenessContext.jsx`, replace lines `4-6` with:

```javascript
// Completeness is derived from persistent profile fields, an emergency
// contact, and the backend-owned `data_privacy_consented_at` timestamp
// (see src/lib/profileCompleteness.js).
// The source of truth is the same shape recordsApi.medicalSummary() returns
```

Keep all runtime code in that file unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test "tests/frontend/studentProfileCompletion.test.mjs"`

Expected: PASS, `3 passed, 0 failed`.

---

### Task 4: Final-submit payload and shared save helper

**Files:**
- Modify: `src/lib/studentProfileEditPayload.js`
- Create: `src/lib/studentProfileSave.js`
- Modify: `src/components/student/EditStudentInfoModal.jsx:855-940`
- Modify: `src/components/student/StudentRecordPanel.jsx:6-14,144-170`
- Modify: `tests/frontend/studentProfileEditPayload.test.mjs`
- Create: `tests/frontend/studentProfileSave.test.mjs`

**Interfaces:**
- Consumes: `buildSafeProfilePatch(payload, medicalSummaryLoaded, includeConsent)`.
- Produces: `submitStudentProfilePatch(studentId, payload, applyProfile, updateProfile)` returning `{ data, complete }` after applying the PATCH echo.

- [ ] **Step 1: Extend payload tests**

Replace `tests/frontend/studentProfileEditPayload.test.mjs` with:

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSafeProfilePatch } from '../../src/lib/studentProfileEditPayload.js'

const PAYLOAD = {
  first_name: 'Juan',
  emergency_contact: { contact_name: 'Maria' },
  medical_history: { has_asthma: true },
}

test('buildSafeProfilePatch preserves medical sections when summary is loaded', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true), PAYLOAD)
})

test('buildSafeProfilePatch omits medical sections when summary is unavailable', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false), {
    first_name: 'Juan',
  })
})

test('buildSafeProfilePatch adds consent only when explicitly requested', () => {
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, false), PAYLOAD)
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, false), {
    first_name: 'Juan',
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, true, true), {
    ...PAYLOAD,
    data_privacy_consent: true,
  })
  assert.deepEqual(buildSafeProfilePatch(PAYLOAD, false, true), {
    first_name: 'Juan',
    data_privacy_consent: true,
  })
})
```

- [ ] **Step 2: Create failing save-helper tests**

Create `tests/frontend/studentProfileSave.test.mjs` with:

```javascript
import test from "node:test"
import assert from "node:assert/strict"

import { submitStudentProfilePatch } from "../../src/lib/studentProfileSave.js"

test("submitStudentProfilePatch applies the PATCH echo before returning", async () => {
  const echo = {
    data: {
      profile: {
        first_name: "Juan",
        last_name: "Dela Cruz",
        gender: "Male",
        birth_date: "2004-02-05",
        civil_status: "Single",
        contact_number: "09123456789",
        present_address: "Gordon College",
        department_id: 1,
        course_id: 2,
        data_privacy_consented_at: "2026-11-25T10:00:00+00:00",
      },
      emergency_contact: { contact_name: "Maria" },
    },
  }
  const calls = []
  const fakeUpdate = async (studentId, payload) => {
    calls.push(["patch", studentId, payload])
    return echo
  }
  const fakeApply = (data) => calls.push(["apply", data])

  const result = await submitStudentProfilePatch(
    "202311330",
    { first_name: "Juan", data_privacy_consent: true },
    fakeApply,
    fakeUpdate
  )

  assert.equal(result.complete, true)
  assert.deepEqual(result.data, echo.data)
  assert.deepEqual(calls[0], [
    "patch",
    "202311330",
    { first_name: "Juan", data_privacy_consent: true },
  ])
  assert.deepEqual(calls[1], ["apply", echo.data])
})

test("submitStudentProfilePatch rejects a missing echo without applying it", async () => {
  let applied = false
  const fakeUpdate = async () => ({})
  const fakeApply = () => {
    applied = true
  }

  await assert.rejects(
    () => submitStudentProfilePatch("202311330", {}, fakeApply, fakeUpdate),
    /Save failed/
  )
  assert.equal(applied, false)
})

test("submitStudentProfilePatch reports incomplete records without throwing", async () => {
  const echo = {
    data: {
      profile: {
        first_name: "Juan",
        data_privacy_consented_at: null,
      },
      emergency_contact: null,
    },
  }
  const fakeUpdate = async () => echo
  const applied = []
  const result = await submitStudentProfilePatch(
    "202311330",
    {},
    (data) => applied.push(data),
    fakeUpdate
  )

  assert.equal(result.complete, false)
  assert.deepEqual(applied, [echo.data])
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```powershell
node --test "tests/frontend/studentProfileEditPayload.test.mjs" "tests/frontend/studentProfileSave.test.mjs"
```

Expected: FAIL because the payload helper has no third argument and `studentProfileSave.js` does not exist.

- [ ] **Step 4: Implement payload consent support**

Replace `src/lib/studentProfileEditPayload.js` with:

```javascript
export function buildSafeProfilePatch(
  payload,
  medicalSummaryLoaded,
  includeConsent = false
) {
  const base = medicalSummaryLoaded
    ? { ...payload }
    : Object.fromEntries(
        Object.entries(payload).filter(
          ([key]) => key !== "emergency_contact" && key !== "medical_history"
        )
      )

  return includeConsent ? { ...base, data_privacy_consent: true } : base
}
```

- [ ] **Step 5: Implement the shared save helper**

Create `src/lib/studentProfileSave.js` with:

```javascript
import { recordsApi } from "./api.js"
import { isStudentProfileComplete } from "./profileCompleteness.js"

export async function submitStudentProfilePatch(
  studentId,
  payload,
  applyProfile,
  updateProfile = recordsApi.updateProfile
) {
  const response = await updateProfile(studentId, payload)
  const data = response?.data
  if (!data) {
    throw new Error("Save failed. Please try again.")
  }

  applyProfile(data)
  return { data, complete: isStudentProfileComplete(data) }
}
```

- [ ] **Step 6: Wire final-submit consent and onboarding mode into the modal**

In `src/components/student/EditStudentInfoModal.jsx`, add `onboarding = false` to the component parameter list after `medicalSummaryLoaded = true`.

Replace:

```javascript
    const payload = buildSafeProfilePatch(
      mapToBackendPayload(student, form, photoPreview, departments, courses),
      medicalSummaryLoaded
    );
```

with:

```javascript
    const payload = buildSafeProfilePatch(
      mapToBackendPayload(student, form, photoPreview, departments, courses),
      medicalSummaryLoaded,
      form.consent
    );
```

Replace the top exit Back button block (`951-963`) with:

```javascript
      {!onboarding && (
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className={`btn-press inline-flex items-center gap-1.5 text-sm font-semibold w-fit transition-colors ${
            isSaving
              ? "text-ink-400 opacity-50 cursor-not-allowed"
              : "text-ink-500 hover:text-brand-900"
          }`}
        >
          <NavIcon name="back" className="w-4 h-4" />
          Back
        </button>
      )}
```

Step-to-step Back buttons inside step 2 and step 3 remain unchanged.

- [ ] **Step 7: Use the shared helper in the normal edit page**

In `src/components/student/StudentRecordPanel.jsx`, replace the import of `isStudentProfileComplete` with:

```javascript
import { submitStudentProfilePatch } from "../../lib/studentProfileSave.js";
```

Replace `handleSave` (`144-170`) with:

```javascript
  async function handleSave(payload, updatedStudent) {
    setSaveError(null);
    setIsSaving(true);
    try {
      const { complete } = await submitStudentProfilePatch(
        studentId,
        payload,
        applyProfile
      );
      setStudent(updatedStudent);
      setEditing(false);
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 4000);
      if (complete) {
        window.setTimeout(() => navigate("/student/dashboard"), 1600);
      }
    } catch (err) {
      setSaveError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }
```

Normal edit behavior stays the same: saved notice, no navigation when incomplete, delayed navigation when complete.

- [ ] **Step 8: Run the tests to verify they pass**

Run:

```powershell
node --test "tests/frontend/studentProfileEditPayload.test.mjs" "tests/frontend/studentProfileSave.test.mjs" "tests/frontend/studentProfileCompletion.test.mjs"
```

Expected: PASS with 0 failures.

---

### Task 5: Onboarding route, guard, and dashboard redirect

**Files:**
- Create: `src/pages/student/ProfileEdit.jsx`
- Modify: `src/router/lazyPages.js:24-27`
- Modify: `src/router/index.jsx:65-71`
- Modify: `src/layouts/StudentLayout.jsx:13-15,94-100`
- Test: `tests/frontend/studentProfileOnboarding.test.mjs`

**Interfaces:**
- Consumes: `EditStudentInfoModal`, `useProfileCompleteness`, `submitStudentProfilePatch`, and `adaptStudent`.
- Produces: `/student/profile/edit` onboarding route; incomplete students redirected there; complete students allowed through.

- [ ] **Step 1: Write failing onboarding source-contract tests**

Create `tests/frontend/studentProfileOnboarding.test.mjs` with:

```javascript
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relativePath) =>
  readFileSync(path.join(here, "..", "..", relativePath), "utf8")

test("router exposes the protected onboarding edit route", () => {
  const router = read("src/router/index.jsx")
  const lazyPages = read("src/router/lazyPages.js")

  assert.match(router, /path: 'profile\/edit'/)
  assert.match(router, /<P\.StudentProfileEdit \/>/)
  assert.match(lazyPages, /StudentProfileEdit = lazy\(/)
})

test("layout redirects incomplete students to the edit route", () => {
  const source = read("src/layouts/StudentLayout.jsx")

  assert.match(source, /EDIT_PATH = "\/student\/profile\/edit"/)
  assert.match(source, /location\.pathname !== EDIT_PATH/)
  assert.match(source, /<Navigate to=\{EDIT_PATH\} replace \/>/)
  assert.match(source, /checking \? \(/)
})

test("onboarding page applies completion before navigating to dashboard", () => {
  const source = read("src/pages/student/ProfileEdit.jsx")

  assert.match(source, /onboarding/)
  assert.match(source, /flushSync/)
  assert.match(source, /submitStudentProfilePatch\(/)
  assert.match(source, /applyProfile/)
  assert.match(source, /complete/)
  assert.match(source, /navigate\("\/student\/dashboard", \{ replace: true \}\)/)

  const applyIndex = source.indexOf("submitStudentProfilePatch(")
  const navigateIndex = source.indexOf('navigate("/student/dashboard"')
  assert.ok(applyIndex !== -1 && navigateIndex !== -1)
  assert.ok(applyIndex < navigateIndex)
})

test("login files remain free of consent storage logic", () => {
  for (const file of [
    "src/pages/auth/StudentLogin.jsx",
    "src/components/auth/StudentLoginForm.jsx",
    "src/lib/supabaseClient.js",
  ]) {
    const source = read(file)
    assert.doesNotMatch(source, /data_privacy_consent/)
    assert.doesNotMatch(source, /localStorage/)
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "tests/frontend/studentProfileOnboarding.test.mjs"`

Expected: FAIL because the route, page, and guard changes are not present.

- [ ] **Step 3: Create the onboarding page**

Create `src/pages/student/ProfileEdit.jsx` with:

```javascript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import EditStudentInfoModal from "../components/student/EditStudentInfoModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfileCompleteness } from "../context/ProfileCompletenessContext.jsx";
import { masterlistApi } from "../lib/api.js";
import { adaptStudent } from "../lib/studentProfileAdapter.js";
import {
  createMedicalSummaryLoader,
  createStudentProfileLoader,
} from "../lib/studentProfileLoading.js";
import { submitStudentProfilePatch } from "../lib/studentProfileSave.js";

export default function ProfileEdit() {
  const navigate = useNavigate();
  const { studentId } = useAuth();
  const {
    medicalSummary,
    medicalSummaryStudentId,
    loadMedicalSummary,
    applyProfile,
  } = useProfileCompleteness();

  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const recordsApiMedicalSummary = useCallback(
    (id) => loadMedicalSummary(id).then(({ summary: loaded }) => loaded),
    [loadMedicalSummary]
  );

  const profileLoaderRef = useRef(null);
  const summaryLoaderRef = useRef(null);
  if (!profileLoaderRef.current) {
    profileLoaderRef.current = createStudentProfileLoader(masterlistApi.getStudent);
  }
  if (!summaryLoaderRef.current) {
    summaryLoaderRef.current = createMedicalSummaryLoader(recordsApiMedicalSummary);
  }

  useEffect(() => {
    let active = true;
    setProfile(null);
    setProfileError(null);

    if (!studentId) {
      setProfileError("Student account unavailable for this session.");
      return () => {
        active = false;
      };
    }

    profileLoaderRef.current
      .load(studentId)
      .then((data) => active && setProfile(data))
      .catch((err) => {
        if (active) setProfileError(err?.message || "Failed to load your record");
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    let active = true;
    setSummaryError(null);

    if (!studentId) {
      setSummary(null);
      return () => {
        active = false;
      };
    }

    const shared = medicalSummaryStudentId === studentId ? medicalSummary : null;
    if (shared) {
      setSummary(shared);
      return () => {
        active = false;
      };
    }

    setSummary(null);
    summaryLoaderRef.current
      .load(studentId)
      .then(({ summary: loaded }) => active && setSummary(loaded))
      .catch((err) => {
        if (active) setSummaryError(err?.message || "Could not load medical details");
      });

    return () => {
      active = false;
    };
  }, [studentId, medicalSummary, medicalSummaryStudentId]);

  useEffect(() => {
    if (!profile) return undefined;
    let active = true;

    masterlistApi
      .listDepartments()
      .then((depts) => {
        if (!active) return;
        setDepartments(depts || []);
        const current = (depts || []).find(
          (d) => d.department_name === profile.department_name
        );
        if (current) {
          masterlistApi
            .listCourses(current.department_id)
            .then((cs) => active && setCourses(cs || []))
            .catch(() => active && setCourses([]));
        }
      })
      .catch(() => active && setDepartments([]));

    return () => {
      active = false;
    };
  }, [profile]);

  const student = useMemo(
    () => adaptStudent(profile, summary),
    [profile, summary]
  );

  async function handleSave(payload, updatedStudent) {
    setSaveError(null);
    setIsSaving(true);
    try {
      const { complete } = await submitStudentProfilePatch(
        studentId,
        payload,
        (data) => flushSync(() => applyProfile(data))
      );
      if (!complete) {
        setSaveError(
          "Some required information is still missing. Please review the form."
        );
        return;
      }
      navigate("/student/dashboard", { replace: true });
    } catch (err) {
      setSaveError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (profileError) {
    return (
      <div role="alert" className="rounded-panel bg-signal-rose-bg p-8 text-center text-sm text-signal-rose shadow-e1">
        {profileError}
      </div>
    );
  }

  if (!student) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your profile">
        <div className="h-36 animate-pulse rounded-panel bg-ink-100" />
        <div className="h-64 animate-pulse rounded-panel bg-ink-100/70" />
      </div>
    );
  }

  return (
    <div className="pt-2 md:pt-4 max-w-6xl mx-auto">
      {summaryError && (
        <div role="alert" className="mb-4 rounded-panel border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {summaryError} Only personal information will be saved until medical details load.
        </div>
      )}
      <EditStudentInfoModal
        student={student}
        departments={departments}
        courses={courses}
        onClose={() => navigate("/student/profile", { replace: true })}
        onSave={handleSave}
        isSaving={isSaving}
        saveError={saveError}
        medicalSummaryLoaded={Boolean(summary)}
        onboarding
      />
    </div>
  );
}
```

- [ ] **Step 4: Add the lazy page export**

In `src/router/lazyPages.js`, add after `export const StudentRecord`:

```javascript
export const StudentProfileEdit = lazy(() => import('../pages/student/ProfileEdit.jsx'))
```

- [ ] **Step 5: Add the route**

In `src/router/index.jsx`, add after the `profile` child:

```javascript
          { path: 'profile/edit', element: <P.StudentProfileEdit /> },
```

- [ ] **Step 6: Update the student layout gate**

In `src/layouts/StudentLayout.jsx`, replace:

```javascript
// The one student page that is always reachable — the rest (Dashboard / Book
// / Feedback) stay locked behind the complete-your-record gate below.
const RECORD_PATH = "/student/profile";
```

with:

```javascript
// The one student page an incomplete record may reach — the existing edit
// form is exposed here as a dedicated onboarding route.
const EDIT_PATH = "/student/profile/edit";
```

Replace:

```javascript
  if (!checking && status === "incomplete" && location.pathname !== RECORD_PATH) {
    return <Navigate to={RECORD_PATH} replace />;
  }
```

with:

```javascript
  if (!checking && status === "incomplete" && location.pathname !== EDIT_PATH) {
    return <Navigate to={EDIT_PATH} replace />;
  }
```

Keep the loader branch at lines `122-134` unchanged.

- [ ] **Step 7: Run the onboarding tests**

Run: `node --test "tests/frontend/studentProfileOnboarding.test.mjs"`

Expected: PASS, `4 passed, 0 failed`.

- [ ] **Step 8: Run all focused frontend tests**

Run:

```powershell
node --test "tests/frontend/studentProfileCompletion.test.mjs" "tests/frontend/studentProfileEditPayload.test.mjs" "tests/frontend/studentProfileSave.test.mjs" "tests/frontend/studentProfileOnboarding.test.mjs"
```

Expected: PASS with 0 failures.

---

### Task 6: Full verification and documented deferral

**Files:**
- Modify: `.ai/progress/PROGRESS.md`
- No application source files are intentionally changed in this task.

**Interfaces:**
- Consumes: all files produced above.
- Produces: verified migration state, passing backend/frontend tests, passing build, clean diff check, and a progress entry recording the deferred GET authorization work.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
python -m pytest tests/test_privacy_migration_contract.py tests/test_student_record_consent.py tests/test_appointment_reschedule.py -q
```

Expected: PASS with 0 failures.

- [ ] **Step 2: Run the full frontend suite**

Run:

```powershell
node --test "tests/frontend/*.test.mjs"
```

Expected: PASS with 0 failures.

- [ ] **Step 3: Run the Vite production build**

Run: `npm run build`

Expected: exit `0`; Vite reports a successful production build.

- [ ] **Step 4: Re-probe migration state after application**

Run the Step 5 probe from Task 1 again.

Expected: `students` and `student_masterlist` both report `present`. If not, stop and report; do not claim schema verification.

- [ ] **Step 5: Verify live onboarding and relogin behavior**

This check requires a local/dev test student login that is known to be incomplete before consent, then complete after consent.

Run the local dev server if needed:

```powershell
npm run dev
```

Use Playwright only against `http://localhost:5173` with a test student account:

1. Log in with an incomplete test student. Expected: URL becomes `/student/profile/edit`; the dashboard does not render.
2. Try `/student/dashboard` directly. Expected: redirected back to `/student/profile/edit`.
3. Complete the three steps, check the unchanged Data Privacy checkbox, and submit. Expected: redirect to `/student/dashboard`.
4. Log out and log in again with the same test student. Expected: direct `/student/dashboard`, no edit redirect.
5. Refresh `/student/dashboard`. Expected: it stays on the dashboard.

If no local test student credentials are available, stop this step and report that live relogin verification is blocked. Do not use production accounts or real student data. The automated tests still cover completeness, payload, API echo, and redirect source contracts.

- [ ] **Step 6: Run Git checks**

Run:

```powershell
& "C:\Program Files\Git\cmd\git.exe" diff --check
& "C:\Program Files\Git\cmd\git.exe" diff --cached --name-only
```

Expected: `diff --check` exit `0`; staged output empty. Pre-existing LF→CRLF warnings are acceptable if they were present before this task, but new whitespace errors are not.

- [ ] **Step 7: Append progress notes**

Append a new section to `.ai/progress/PROGRESS.md` that records:

- Migration applied only after target verification, or explicitly report if application was blocked.
- Backend consent test results.
- Frontend suite and build results.
- Live onboarding/relogin result or the exact blocker.
- Deferred security improvement: owner-or-admin scoping for `GET /api/records/<student_id>/medical-summary`.
- No staging, commit, push, reset, or revert.

- [ ] **Step 8: Final self-check**

Confirm all of the following before reporting completion:

- Existing uncommitted work was preserved.
- No staged files, commit, push, reset, or revert occurred.
- No clean rebuild, seed, backfill, RLS, grant, or data reset ran.
- `GET /api/records/<student_id>/medical-summary` authorization was not changed.
- Login files and admin routes were not changed.
- Consent wording and checkbox behavior were not changed.
- Only one additive migration was applied.
- All verification claims cite observed command output.

## Self-Review Checklist

- [ ] Every spec requirement maps to a task above.
- [ ] No `TBD`, `TODO`, “implement later”, “fill in details”, or “similar to Task N” remains.
- [ ] `data_privacy_consented_at`, `data_privacy_consent`, `EDIT_PATH`, and `submitStudentProfilePatch` names are consistent across tasks.
- [ ] Ownership rules match the spec: ordinary admin bypass preserved, consent owner-only.
- [ ] Deferred GET scoping is documented and not implemented.
- [ ] User’s no-stage/no-commit constraint overrides the writing-plans default commit steps.
