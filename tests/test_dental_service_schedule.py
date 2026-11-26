"""Dental Service reason + reason-scoped clinic schedule contract tests.

Covers:
  * Migration/schema contract for
    migrations/2026-11-26_dental_service_schedule.sql: additive
    columns, idempotent Dental Service insert, dedicated flag true,
    no default schedule/time_slots rows, (working_date, reason_id)
    index — plus clean DDL/seed parity.
  * GET /reasons exposes uses_dedicated_schedule while retaining the
    existing fields.
  * resolve_reason_scope rule: dedicated -> its own schedules only;
    non-dedicated / omitted -> legacy general scope; unknown -> error.
  * GET /appointments/slots reason scoping: same date gives different
    availability for Dental vs Consultation; a dedicated reason with
    no configured schedule returns empty (no virtual defaults, no
    materialization); Consultation keeps general/virtual slots;
    invalid reason_id -> 400.
  * POST /appointments rejects a Dental booking made with a
    Consultation/general slot, accepts only a reason-scoped slot,
    validates unknown reasons (400), and runs the closed-date check
    against the booking's own reason scope.
  * Clinic schedule CRUD + preview scope by reason without touching
    general rows (and vice versa).

Everything runs against an in-memory fake of the Supabase tables in
the existing Flask test-client + monkeypatch style — no live
DB/network calls.
"""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from postgrest import APIError as PostgrestAPIError

import pytest

from main import app

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-26_dental_service_schedule.sql"
CLEAN_DDL = ROOT / "migrations" / "2026-08-28_clean_rebuild_ddl.sql"
CLEAN_SEED = ROOT / "migrations" / "2026-08-28_clean_seed.sql"

AUTH = {"Authorization": "Bearer test-token"}

GENERAL_ID = 1        # Consultation — non-dedicated -> general scope
MED_CERT_ID = 2       # Medical Certificate — non-dedicated
DENTAL_ID = 3         # Dental Service — dedicated schedule

DATE = "2099-03-02"          # has BOTH a general and a dental schedule
DATE_GENERAL_ONLY = "2099-03-09"   # general schedule only (no dental)
DATE_EMPTY = "2099-03-16"    # no schedules at all

REASONS = {
    GENERAL_ID: {
        "reason_id": GENERAL_ID,
        "description": "Consultation",
        "is_active": True,
        "uses_dedicated_schedule": False,
    },
    MED_CERT_ID: {
        "reason_id": MED_CERT_ID,
        "description": "Medical Certificate",
        "is_active": True,
        "uses_dedicated_schedule": False,
    },
    DENTAL_ID: {
        "reason_id": DENTAL_ID,
        "description": "Dental Service",
        "is_active": True,
        "uses_dedicated_schedule": True,
    },
}


# ============================================================
# In-memory fake of the Supabase tables used by these routes
# ============================================================

class FakeResponse:
    def __init__(self, data=None, count=None):
        self.data = list(data) if data else []
        self.count = len(self.data) if count is None else count
        self.error = None


class FakeQuery:
    """Records PostgREST-style ops + filters; FakeState.run executes them."""

    def __init__(self, state, table):
        self.state = state
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []      # ("eq"|"is"|"in", column, value)
        self._order = None     # (column, desc)
        self._limit = None

    def select(self, *fields, **kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def is_(self, column, value):
        self.filters.append(("is", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, list(values)))
        return self

    def order(self, column, desc=False):
        self._order = (column, desc)
        return self

    def limit(self, count):
        self._limit = count
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return self.state.run(self)


class FakeState:
    """Tiny table store interpreting FakeQuery ops (no SQL, no network)."""

    PKS = {
        "clinic_schedules": "schedule_id",
        "time_slots": "slot_id",
        "appointments": "appointment_id",
        "appointment_reasons": "reason_id",
        "clinic_appointment_settings": "setting_id",
    }

    def __init__(self):
        self.tables = {}
        self._next = dict.fromkeys(self.PKS, 1000)

    def table(self, name):
        return FakeQuery(self, name)

    @staticmethod
    def _matches(row, filters):
        for kind, column, expected in filters:
            actual = row.get(column)
            if kind == "eq":
                if actual != expected:
                    return False
            elif kind == "is":
                if expected in (None, "null"):
                    if actual is not None:
                        return False
                elif actual != expected:
                    return False
            elif kind == "in":
                if actual not in expected:
                    return False
            else:  # pragma: no cover - unknown operator
                raise AssertionError(f"unsupported filter {kind!r}")
        return True

    def run(self, query):
        rows = self.tables.setdefault(query.table, [])

        if query.op == "select":
            matched = [dict(r) for r in rows if self._matches(r, query.filters)]
            if query._order:
                column, desc = query._order
                matched.sort(
                    key=lambda r: (r.get(column) is None, r.get(column)),
                    reverse=desc,
                )
            if query._limit is not None:
                matched = matched[: query._limit]
            return FakeResponse(matched)

        if query.op == "insert":
            payload = query.payload
            items = payload if isinstance(payload, list) else [payload]
            created = []
            pk = self.PKS.get(query.table)
            for item in items:
                row = dict(item)
                if pk and row.get(pk) is None:
                    self._next[query.table] += 1
                    row[pk] = self._next[query.table]
                rows.append(row)
                created.append(dict(row))
            return FakeResponse(created)

        matched_idx = [
            i for i, r in enumerate(rows) if self._matches(r, query.filters)
        ]

        if query.op == "update":
            updated = []
            for i in matched_idx:
                rows[i].update(query.payload)
                updated.append(dict(rows[i]))
            return FakeResponse(updated)

        if query.op == "delete":
            removed = [rows[i] for i in reversed(matched_idx)]
            for i in reversed(matched_idx):
                rows.pop(i)
            return FakeResponse([dict(r) for r in removed])

        raise AssertionError(f"unsupported fake operation {query.op!r}")


class LegacySchemaState(FakeState):
    """Fake state for environments where the additive reason_id column is absent."""

    def __init__(self):
        super().__init__()
        self.queries = []

    def table(self, name):
        return LegacySchemaQuery(self, name)


class LegacySchemaQuery(FakeQuery):
    """Fails exactly like live PostgREST when reason_id is referenced."""

    def __init__(self, state, table):
        super().__init__(state, table)
        self.select_fields = []

    def select(self, *fields, **kwargs):
        self.select_fields = list(fields)
        if "reason_id" in fields:
            raise PostgrestAPIError({
                "message": "column clinic_schedules.reason_id does not exist",
                "code": "42703",
            })
        return super().select(*fields, **kwargs)

    def eq(self, column, value):
        if column == "reason_id":
            raise PostgrestAPIError({
                "message": "column clinic_schedules.reason_id does not exist",
                "code": "42703",
            })
        return super().eq(column, value)

    def is_(self, column, value):
        if column == "reason_id":
            raise PostgrestAPIError({
                "message": "column clinic_schedules.reason_id does not exist",
                "code": "42703",
            })
        return super().is_(column, value)

    def in_(self, column, values):
        if column == "reason_id":
            raise PostgrestAPIError({
                "message": "column clinic_schedules.reason_id does not exist",
                "code": "42703",
            })
        return super().in_(column, values)

    def execute(self):
        self.state.queries.append(self)
        return self.state.run(self)


def build_state():
    state = FakeState()
    state.tables["appointment_reasons"] = [dict(r) for r in REASONS.values()]
    state.tables["clinic_schedules"] = [
        {
            "schedule_id": 10,
            "working_date": DATE,
            "work_start": "08:00:00",
            "work_end": "12:00:00",
            "break_start": None,
            "break_end": None,
            "is_enabled": True,
            "closure_reason": None,
            "reason_id": None,          # legacy GENERAL schedule
        },
        {
            "schedule_id": 20,
            "working_date": DATE,
            "work_start": "14:00:00",
            "work_end": "16:00:00",
            "break_start": None,
            "break_end": None,
            "is_enabled": True,
            "closure_reason": None,
            "reason_id": DENTAL_ID,     # DEDICATED dental schedule
        },
        {
            "schedule_id": 11,
            "working_date": DATE_GENERAL_ONLY,
            "work_start": "08:00:00",
            "work_end": "12:00:00",
            "break_start": None,
            "break_end": None,
            "is_enabled": True,
            "closure_reason": None,
            "reason_id": None,
        },
    ]
    state.tables["time_slots"] = [
        {"slot_id": 101, "schedule_id": 10, "slot_start": "08:00:00",
         "slot_end": "08:30:00", "max_capacity": 8},
        {"slot_id": 102, "schedule_id": 10, "slot_start": "08:30:00",
         "slot_end": "09:00:00", "max_capacity": 8},
        {"slot_id": 111, "schedule_id": 11, "slot_start": "09:00:00",
         "slot_end": "09:30:00", "max_capacity": 8},
        {"slot_id": 201, "schedule_id": 20, "slot_start": "14:00:00",
         "slot_end": "14:30:00", "max_capacity": 8},
        {"slot_id": 202, "schedule_id": 20, "slot_start": "14:30:00",
         "slot_end": "15:00:00", "max_capacity": 8},
    ]
    state.tables["appointments"] = []
    state.tables["clinic_appointment_settings"] = [
        {
            "setting_id": 1,
            "slot_interval_minutes": 30,
            "max_students_per_slot": 8,
            "work_start": "08:00:00",
            "work_end": "12:00:00",
            "break_start": None,
            "break_end": None,
        }
    ]
    return state


def _fake_write_status(appointment_id, previous_status, new_status,
                       remarks, changed_by):
    return FakeResponse([{
        "appointment_id": appointment_id,
        "new_status": new_status,
    }])


@pytest.fixture
def env():
    state = build_state()
    fake_supabase = SimpleNamespace(table=state.table)

    patches = [
        patch(
            "routers.auth_guard._verify_token",
            return_value=SimpleNamespace(
                id="auth-1", email="test001@gordoncollege.edu.ph"
            ),
        ),
        patch("routers.auth_guard.is_admin_user", return_value=True),
        # clinic_schedule module (get_schedule_for_date / schedule CRUD /
        # resolve_reason_scope default lookup)
        patch("routers.clinic_schedule.supabase", fake_supabase),
        patch("routers.clinic_schedule.execute_with_retry",
              side_effect=lambda q, *a, **k: state.run(q)),
        patch("routers.clinic_schedule.build_reason_lookup",
              return_value=dict(REASONS)),
        # appointment module (slots endpoint, booking)
        patch("routers.appointment.supabase", fake_supabase),
        patch("routers.appointment.execute_with_retry",
              side_effect=lambda q, *a, **k: state.run(q)),
        patch("routers.appointment.build_reason_lookup",
              return_value=dict(REASONS)),
        patch("routers.appointment.build_student_lookup", return_value={}),
        patch("routers.appointment.get_latest_status_for_appointments",
              return_value={}),
        patch("routers.appointment._caller_is_admin", return_value=True),
        patch("routers.appointment._is_bookable_date", return_value=True),
        patch("routers.appointment.resolve_student_id",
              return_value="TEST001"),
        patch("routers.appointment.get_max_students_per_slot", return_value=8),
        patch("routers.appointment.resolve_changed_by_admin_id",
              return_value="admin-1"),
        patch("routers.appointment._write_status",
              side_effect=_fake_write_status),
        # logbook module (GET /reasons)
        patch("routers.logbook.build_reason_lookup",
              return_value=dict(REASONS)),
    ]

    started = [p.start() for p in patches]

    app.config["TESTING"] = True
    client = app.test_client()

    yield SimpleNamespace(client=client, state=state, fake_supabase=fake_supabase,
                          started=started, patches=patches)

    for p in reversed(patches):
        p.stop()


@pytest.fixture
def legacy_env():
    """Same data as env, but clinic_schedules has no reason_id column."""
    state = LegacySchemaState()
    base = build_state()
    state.tables = {
        table: [dict(row) for row in rows]
        for table, rows in base.tables.items()
    }
    for row in state.tables["clinic_schedules"]:
        row.pop("reason_id", None)

    fake_supabase = SimpleNamespace(table=state.table)
    patches = [
        patch(
            "routers.auth_guard._verify_token",
            return_value=SimpleNamespace(
                id="auth-1", email="test001@gordoncollege.edu.ph"
            ),
        ),
        patch("routers.auth_guard.is_admin_user", return_value=True),
        patch("routers.clinic_schedule.supabase", fake_supabase),
        patch("routers.clinic_schedule.execute_with_retry",
              side_effect=lambda q, *a, **k: state.run(q)),
        patch("routers.clinic_schedule.build_reason_lookup",
              return_value=dict(REASONS)),
        patch("routers.appointment.supabase", fake_supabase),
        patch("routers.appointment.execute_with_retry",
              side_effect=lambda q, *a, **k: state.run(q)),
        patch("routers.appointment.build_reason_lookup",
              return_value=dict(REASONS)),
        patch("routers.appointment.build_student_lookup", return_value={}),
        patch("routers.appointment.get_latest_status_for_appointments",
              return_value={}),
        patch("routers.appointment._caller_is_admin", return_value=True),
        patch("routers.appointment._is_bookable_date", return_value=True),
        patch("routers.appointment.resolve_student_id",
              return_value="TEST001"),
        patch("routers.appointment.get_max_students_per_slot", return_value=8),
        patch("routers.appointment.resolve_changed_by_admin_id",
              return_value="admin-1"),
        patch("routers.appointment._write_status",
              side_effect=_fake_write_status),
        patch("routers.logbook.build_reason_lookup",
              return_value=dict(REASONS)),
    ]
    started = [p.start() for p in patches]

    app.config["TESTING"] = True
    client = app.test_client()

    yield SimpleNamespace(client=client, state=state, fake_supabase=fake_supabase,
                          started=started, patches=patches)

    for p in reversed(patches):
        p.stop()


def get_slots(env, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return env.client.get(f"/appointments/slots?{query}", headers=AUTH)


def post_appointment(env, **payload):
    payload.setdefault("student_id", "TEST001")
    return env.client.post("/appointments", json=payload, headers=AUTH)


# ============================================================
# 1. Migration / schema contract
# ============================================================

def test_migration_is_additive_idempotent_and_schedule_free():
    sql = MIGRATION.read_text(encoding="utf-8")

    # 1) additive columns
    assert 'ALTER TABLE "appointment_reasons"' in sql
    assert ('ADD COLUMN IF NOT EXISTS "uses_dedicated_schedule" '
            'boolean NOT NULL DEFAULT false') in sql
    assert 'ALTER TABLE "clinic_schedules"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "reason_id" bigint' in sql
    assert 'REFERENCES "appointment_reasons" ("reason_id")' in sql
    assert "ON UPDATE CASCADE ON DELETE SET NULL" in sql

    # 2) idempotent Dental Service insert, dedicated flag true
    assert 'INSERT INTO "appointment_reasons"' in sql
    assert "'Dental Service'" in sql
    assert "ON CONFLICT" in sql
    assert "('Dental Service', TRUE, TRUE)" in sql
    assert 'SET "uses_dedicated_schedule" = TRUE' in sql

    # 3) no schedule/time_slots rows are inserted or modified
    assert 'INSERT INTO "clinic_schedules"' not in sql
    assert 'INSERT INTO "time_slots"' not in sql

    # 4) helpful (working_date, reason_id) index, no destructive SQL
    assert ('CREATE INDEX IF NOT EXISTS '
            '"idx_clinic_schedules_working_date_reason_id"') in sql
    assert 'ON "clinic_schedules" ("working_date", "reason_id")' in sql
    for phrase in ("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"):
        assert phrase not in sql, f"destructive phrase in migration: {phrase}"


def test_clean_ddl_and_seed_match_dental_contract():
    ddl = CLEAN_DDL.read_text(encoding="utf-8")
    seed = CLEAN_SEED.read_text(encoding="utf-8")

    # DDL: both columns appended to the existing table definitions
    reasons_table = ddl[ddl.index('CREATE TABLE "appointment_reasons"'):]
    reasons_table = reasons_table[: reasons_table.index(";")]
    assert '"uses_dedicated_schedule" boolean NOT NULL DEFAULT FALSE' in (
        reasons_table
    )

    schedules_table = ddl[ddl.index('CREATE TABLE "clinic_schedules"'):]
    schedules_table = schedules_table[: schedules_table.index(";")]
    assert '"reason_id"' in schedules_table
    assert 'REFERENCES "appointment_reasons"("reason_id")' in schedules_table
    assert "ON UPDATE CASCADE ON DELETE SET NULL" in schedules_table

    # DDL: the same (working_date, reason_id) index exists
    assert ('CREATE INDEX "idx_clinic_schedules_working_date_reason_id"'
            in ddl)

    # DDL: existing view column order untouched (no reordering)
    view = ddl[ddl.index('CREATE VIEW "student_masterlist" AS'):]
    assert view.index('s."student_id"') < view.index('s."last_name"')
    assert view.index('s."last_name"') < view.index('s."first_name"')
    assert view.index('s."first_name"') < view.index('s."middle_initial"')
    assert 'CREATE VIEW "report_appointment_rows" AS' in ddl

    # Seed: third reason present with dedicated flag true, others false
    reasons_insert = seed[seed.index('INSERT INTO "appointment_reasons"'):]
    reasons_insert = " ".join(
        reasons_insert[: reasons_insert.index(";")].split()
    )
    assert "('Medical Certificate', TRUE, FALSE)" in reasons_insert
    assert "('Consultation', TRUE, FALSE)" in reasons_insert
    assert "('Dental Service', TRUE, TRUE)" in reasons_insert

    # Seed: no extra schedule rows for the new reason — the
    # clinic_schedules insert is untouched (no reason_id column, no
    # Dental rows), so every seeded schedule stays a general one.
    schedules_insert = seed[seed.index('INSERT INTO "clinic_schedules"'):]
    schedules_insert = schedules_insert[: schedules_insert.index(";")]
    assert "reason_id" not in schedules_insert
    assert "Dental" not in schedules_insert


# ============================================================
# 2. GET /reasons contract
# ============================================================

def test_reasons_endpoint_exposes_dedicated_flag(env):
    resp = env.client.get("/reasons", headers=AUTH)

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True

    by_id = {r["reason_id"]: r for r in body["reasons"]}
    assert set(by_id) == {GENERAL_ID, MED_CERT_ID, DENTAL_ID}

    # existing fields retained
    for row in body["reasons"]:
        assert set(row) >= {"reason_id", "description",
                            "uses_dedicated_schedule"}
        assert isinstance(row["uses_dedicated_schedule"], bool)

    assert by_id[GENERAL_ID]["description"] == "Consultation"
    assert by_id[GENERAL_ID]["uses_dedicated_schedule"] is False
    assert by_id[MED_CERT_ID]["description"] == "Medical Certificate"
    assert by_id[MED_CERT_ID]["uses_dedicated_schedule"] is False
    assert by_id[DENTAL_ID]["description"] == "Dental Service"
    assert by_id[DENTAL_ID]["uses_dedicated_schedule"] is True


def test_reasons_endpoint_recognizes_dental_without_dedicated_flag_column(env):
    partial_reasons = {
        GENERAL_ID: {"reason_id": GENERAL_ID, "description": "Consultation", "is_active": True},
        DENTAL_ID: {"reason_id": DENTAL_ID, "description": "Dental Service", "is_active": True},
    }

    with patch("routers.logbook.build_reason_lookup", return_value=partial_reasons):
        resp = env.client.get("/reasons", headers=AUTH)

    assert resp.status_code == 200
    by_id = {r["reason_id"]: r for r in resp.get_json()["reasons"]}
    assert by_id[GENERAL_ID]["uses_dedicated_schedule"] is False
    assert by_id[DENTAL_ID]["uses_dedicated_schedule"] is True


def test_admin_logbook_reason_filter_can_target_dental_reason():
    from routers.logbook import _logbook_page_query_params

    _, filters = _logbook_page_query_params(None, None, [DENTAL_ID], [], [])
    assert ("appointments.reason_id", "in", [DENTAL_ID]) in filters


# ============================================================
# 3. resolve_reason_scope rule
# ============================================================

def test_resolve_reason_scope_rule():
    from routers.clinic_schedule import resolve_reason_scope

    with patch("routers.clinic_schedule.build_reason_lookup",
               return_value=dict(REASONS)):
        # omitted / blank -> general scope (None)
        assert resolve_reason_scope(None) is None
        assert resolve_reason_scope("") is None
        assert resolve_reason_scope("   ") is None

        # dedicated reason -> its own scope id
        assert resolve_reason_scope(DENTAL_ID) == DENTAL_ID
        assert resolve_reason_scope(str(DENTAL_ID)) == DENTAL_ID

        # non-dedicated reasons -> legacy general scope
        assert resolve_reason_scope(GENERAL_ID) is None
        assert resolve_reason_scope(MED_CERT_ID) is None

        # invalid / unknown -> ValueError (callers map it to 400)
        with pytest.raises(ValueError):
            resolve_reason_scope(999)
        with pytest.raises(ValueError):
            resolve_reason_scope("abc")


def test_resolve_reason_scope_recognizes_dental_without_dedicated_flag_column():
    from routers.clinic_schedule import resolve_reason_scope

    partial_reasons = {
        GENERAL_ID: {"reason_id": GENERAL_ID, "description": "Consultation", "is_active": True},
        DENTAL_ID: {"reason_id": DENTAL_ID, "description": "Dental Service", "is_active": True},
    }

    with patch("routers.clinic_schedule.build_reason_lookup", return_value=partial_reasons):
        assert resolve_reason_scope(DENTAL_ID) == DENTAL_ID
        assert resolve_reason_scope(GENERAL_ID) is None


def test_admin_schedule_scope_resolves_any_known_reason_literally():
    from routers.clinic_schedule import resolve_schedule_admin_scope

    with patch("routers.clinic_schedule.build_reason_lookup",
               return_value=dict(REASONS)):
        assert resolve_schedule_admin_scope(None) is None
        assert resolve_schedule_admin_scope("  ") is None
        assert resolve_schedule_admin_scope(GENERAL_ID) == GENERAL_ID
        assert resolve_schedule_admin_scope(MED_CERT_ID) == MED_CERT_ID
        assert resolve_schedule_admin_scope(str(DENTAL_ID)) == DENTAL_ID

        with pytest.raises(ValueError):
            resolve_schedule_admin_scope(999)
        with pytest.raises(ValueError):
            resolve_schedule_admin_scope("abc")


# ============================================================
# 4. GET /appointments/slots reason scoping
# ============================================================

def test_slots_same_date_differs_by_reason(env):
    dental = get_slots(env, date=DATE, reason_id=DENTAL_ID).get_json()
    consult = get_slots(env, date=DATE, reason_id=GENERAL_ID).get_json()
    general = get_slots(env, date=DATE).get_json()

    # Dental sees ONLY its own schedule's slots
    assert dental["success"] is True
    assert dental["count"] == 2
    assert {s["slot_start"][:5] for s in dental["slots"]} == {
        "14:00", "14:30"
    }
    assert {s["schedule_id"] for s in dental["slots"]} == {20}

    # Consultation (non-dedicated) sees the legacy general schedule
    assert consult["count"] == 2
    assert {s["slot_start"][:5] for s in consult["slots"]} == {
        "08:00", "08:30"
    }
    assert {s["schedule_id"] for s in consult["slots"]} == {10}

    # Omitting reason_id behaves exactly like a non-dedicated reason
    assert general == consult


def test_slots_dedicated_without_schedule_is_empty(env):
    resp = get_slots(env, date=DATE_GENERAL_ONLY, reason_id=DENTAL_ID)

    assert resp.status_code == 200
    assert resp.get_json() == {"success": True, "count": 0, "slots": []}

    # ...while Consultation still receives the general schedule's slots
    consult = get_slots(
        env, date=DATE_GENERAL_ONLY, reason_id=GENERAL_ID
    ).get_json()
    assert consult["count"] == 1
    assert consult["slots"][0]["slot_id"] == 111
    assert consult["slots"][0]["schedule_id"] == 11


def test_slots_dedicated_never_gets_virtual_defaults(env):
    # No schedules at all on this date.
    consult = get_slots(env, date=DATE_EMPTY, reason_id=GENERAL_ID)
    consult_body = consult.get_json()
    assert consult.status_code == 200
    assert consult_body["success"] is True
    assert consult_body["count"] > 0
    assert all(s["slot_id"] < 0 for s in consult_body["slots"])

    # Dental on the SAME date: empty — no virtual defaults, and no
    # schedule/slot rows were auto-materialized by the query.
    dental = get_slots(env, date=DATE_EMPTY, reason_id=DENTAL_ID)
    assert dental.status_code == 200
    assert dental.get_json() == {"success": True, "count": 0, "slots": []}
    assert not any(
        row["working_date"] == DATE_EMPTY
        for row in env.state.tables["clinic_schedules"]
    )
    assert not any(
        slot["schedule_id"] not in (10, 11, 20)
        for slot in env.state.tables["time_slots"]
    )


def test_general_virtual_slots_ignore_dedicated_reason_bookings(env):
    """Dental bookings must not consume Consultation/Medical Cert virtual capacity."""
    # On DATE_EMPTY (no schedules), general returns virtual slots. A dental booking
    # at same time must not consume general virtual capacity.
    env.state.tables["appointments"].append({
        "appointment_id": 9001,
        "student_id": "TEST002",
        "time_slot_id": 9999,
        "appointment_date": DATE_EMPTY,
        "appointment_time": "08:00:00",
        "reason_id": DENTAL_ID,
    })

    consult = get_slots(env, date=DATE_EMPTY, reason_id=GENERAL_ID).get_json()
    assert consult["success"] is True
    slot_0800 = next(s for s in consult["slots"] if s["slot_start"][:5] == "08:00")
    assert slot_0800["booked"] == 0
    assert slot_0800["slotsLeft"] == slot_0800["capacity"]


def test_general_virtual_slots_ignore_dedicated_reason_without_db_flag(env):
    """Description fallback must also protect general capacity on partial schemas."""
    partial_reasons = {
        reason_id: dict(row)
        for reason_id, row in REASONS.items()
    }
    partial_reasons[DENTAL_ID].pop("uses_dedicated_schedule", None)

    env.state.tables["appointments"].append({
        "appointment_id": 9003,
        "student_id": "TEST004",
        "time_slot_id": 9999,
        "appointment_date": DATE_EMPTY,
        "appointment_time": "08:00:00",
        "reason_id": DENTAL_ID,
    })

    with patch(
        "routers.appointment.build_reason_lookup",
        return_value=partial_reasons,
    ):
        consult = get_slots(env, date=DATE_EMPTY, reason_id=GENERAL_ID).get_json()

    assert consult["success"] is True
    slot_0800 = next(s for s in consult["slots"] if s["slot_start"][:5] == "08:00")
    assert slot_0800["booked"] == 0
    assert slot_0800["slotsLeft"] == slot_0800["capacity"]


def test_general_real_schedule_slots_ignore_dedicated_reason_bookings(env):
    """Dental bookings must not consume general schedule slot capacity."""
    env.state.tables["time_slots"].append({
        "slot_id": 112,
        "schedule_id": 11,
        "slot_start": "08:00:00",
        "slot_end": "08:30:00",
        "max_capacity": 8,
    })
    env.state.tables["clinic_schedules"].append({
        "schedule_id": 21,
        "working_date": DATE_GENERAL_ONLY,
        "work_start": "08:00:00",
        "work_end": "08:30:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": True,
        "closure_reason": None,
        "reason_id": DENTAL_ID,
    })
    env.state.tables["time_slots"].append({
        "slot_id": 211,
        "schedule_id": 21,
        "slot_start": "08:00:00",
        "slot_end": "08:30:00",
        "max_capacity": 8,
    })
    env.state.tables["appointments"].append({
        "appointment_id": 9002,
        "student_id": "TEST003",
        "time_slot_id": 211,
        "appointment_date": DATE_GENERAL_ONLY,
        "appointment_time": "08:00:00",
        "reason_id": DENTAL_ID,
    })

    general = get_slots(env, date=DATE_GENERAL_ONLY, reason_id=GENERAL_ID).get_json()
    slot_0800 = next(s for s in general["slots"] if s["slot_start"][:5] == "08:00")
    assert slot_0800["booked"] == 0
    assert slot_0800["slotsLeft"] == 8

    dental = get_slots(env, date=DATE_GENERAL_ONLY, reason_id=DENTAL_ID).get_json()
    dental_0800 = next(s for s in dental["slots"] if s["slot_start"][:5] == "08:00")
    assert dental_0800["booked"] == 1
    assert dental_0800["slotsLeft"] == 7


def test_slots_reject_invalid_reason_id(env):
    resp = get_slots(env, date=DATE, reason_id=999)
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False

    resp = get_slots(env, date=DATE, reason_id="abc")
    assert resp.status_code == 400


def test_slots_endpoint_tolerates_missing_reason_id_column(legacy_env):
    """Regression for the live 42703 that made /appointments/slots return 500."""
    resp = get_slots(legacy_env, date=DATE)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["count"] == 2
    assert [slot["slot_id"] for slot in body["slots"]] == [101, 102]
    assert {slot["schedule_id"] for slot in body["slots"]} == {10}

    # Non-dedicated reasons keep the legacy general schedule.
    for reason_id in (GENERAL_ID, MED_CERT_ID):
        scoped = get_slots(legacy_env, date=DATE, reason_id=reason_id)
        assert scoped.status_code == 200
        assert scoped.get_json() == body

    # A dedicated reason must NOT fall back to the general schedule even
    # though this schema cannot store dedicated rows yet.
    dental = get_slots(legacy_env, date=DATE, reason_id=DENTAL_ID)
    assert dental.status_code == 200
    assert dental.get_json() == {"success": True, "count": 0, "slots": []}

    # No query may reference the missing column (PostgREST 42703).
    for query in legacy_env.state.queries:
        if query.table == "clinic_schedules":
            assert "reason_id" not in query.select_fields
            assert all(column != "reason_id" for _, column, _ in query.filters)


# ============================================================
# 5. POST /appointments reason-scoped booking
# ============================================================

def test_booking_rejects_dental_with_general_slot(env):
    resp = post_appointment(
        env,
        appointment_date=DATE,
        appointment_time="08:00",
        slot_id=101,          # belongs to the GENERAL schedule (10)
        reason_id=DENTAL_ID,  # Dental Service must not reuse it
    )

    assert resp.status_code == 400
    assert "not found" in resp.get_json()["error"].lower()
    assert env.state.tables["appointments"] == []


def test_booking_accepts_reason_scoped_dental_slot(env):
    resp = post_appointment(
        env,
        appointment_date=DATE,
        appointment_time="14:00",
        slot_id=201,          # belongs to the DENTAL schedule (20)
        reason_id=DENTAL_ID,
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["success"] is True

    inserted = env.state.tables["appointments"]
    assert len(inserted) == 1
    assert inserted[0]["reason_id"] == DENTAL_ID
    assert inserted[0]["time_slot_id"] == 201
    assert inserted[0]["appointment_date"] == DATE


def test_booking_general_reason_still_uses_general_slot(env):
    # Existing Consultation behaviour: general slot + non-dedicated
    # reason books exactly as before.
    resp = post_appointment(
        env,
        appointment_date=DATE,
        appointment_time="08:00",
        slot_id=101,
        reason_id=GENERAL_ID,
    )

    assert resp.status_code == 201
    inserted = env.state.tables["appointments"]
    assert len(inserted) == 1
    assert inserted[0]["reason_id"] == GENERAL_ID
    assert inserted[0]["time_slot_id"] == 101


def test_booking_general_reason_tolerates_missing_reason_id_column(legacy_env):
    resp = post_appointment(
        legacy_env,
        appointment_date=DATE,
        appointment_time="08:00",
        slot_id=101,
        reason_id=GENERAL_ID,
    )

    assert resp.status_code == 201
    inserted = legacy_env.state.tables["appointments"]
    assert len(inserted) == 1
    assert inserted[0]["time_slot_id"] == 101
    assert inserted[0]["reason_id"] == GENERAL_ID


def test_booking_rejects_unknown_reason(env):
    resp = post_appointment(
        env,
        appointment_date=DATE,
        appointment_time="14:00",
        slot_id=201,
        reason_id=999,
    )

    assert resp.status_code == 400
    assert "reason" in resp.get_json()["error"].lower()
    assert env.state.tables["appointments"] == []


def test_booking_closed_date_check_uses_dental_scope(env):
    # A date whose DENTAL schedule is closed while the GENERAL
    # schedule is open — a Dental booking must see the closure.
    closed_date = "2099-04-06"
    env.state.tables["clinic_schedules"].append({
        "schedule_id": 30,
        "working_date": closed_date,
        "work_start": "08:00:00",
        "work_end": "12:00:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": True,             # general: open
        "closure_reason": None,
        "reason_id": None,
    })
    env.state.tables["clinic_schedules"].append({
        "schedule_id": 31,
        "working_date": closed_date,
        "work_start": "08:00:00",
        "work_end": "12:00:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": False,            # dental: closed
        "closure_reason": "Dental equipment maintenance",
        "reason_id": DENTAL_ID,
    })

    resp = post_appointment(
        env,
        appointment_date=closed_date,
        appointment_time="08:00",
        slot_id=201,
        reason_id=DENTAL_ID,
    )

    assert resp.status_code == 400
    assert "closed" in resp.get_json()["error"].lower()
    assert env.state.tables["appointments"] == []


# ============================================================
# 6. Clinic schedule CRUD + preview reason scoping
# ============================================================

def test_schedule_list_scopes_by_reason(env):
    general = env.client.get("/clinic-schedule", headers=AUTH).get_json()
    assert {r["schedule_id"] for r in general["schedule"]} == {10, 11}

    dental = env.client.get(
        "/clinic-schedule", query_string={"reason_id": DENTAL_ID},
        headers=AUTH,
    ).get_json()
    assert {r["schedule_id"] for r in dental["schedule"]} == {20}

    # Admin schedule filter is literal: even a non-dedicated reason lists
    # ONLY its own rows (none configured in the base fixture). Student
    # slots/preview still map this reason to the general schedule.
    consult = env.client.get(
        "/clinic-schedule", query_string={"reason_id": GENERAL_ID},
        headers=AUTH,
    ).get_json()
    assert {r["schedule_id"] for r in consult["schedule"]} == set()

    invalid = env.client.get(
        "/clinic-schedule", query_string={"reason_id": 999}, headers=AUTH
    )
    assert invalid.status_code == 400


def test_admin_schedule_filter_persists_any_reason_and_preserves_general(env):
    """Admin CRUD uses the literal selected reason_id; General stays NULL."""
    env.state.tables["clinic_schedules"].append({
        "schedule_id": 99,
        "working_date": DATE_GENERAL_ONLY,
        "work_start": "10:00:00",
        "work_end": "12:00:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": True,
        "closure_reason": None,
        "reason_id": GENERAL_ID,
    })

    general = env.client.get("/clinic-schedule", headers=AUTH).get_json()
    assert {r["schedule_id"] for r in general["schedule"]} == {10, 11}

    scoped = env.client.get(
        "/clinic-schedule", query_string={"reason_id": GENERAL_ID},
        headers=AUTH,
    ).get_json()
    assert {r["schedule_id"] for r in scoped["schedule"]} == {99}
    assert all(r["reason_id"] == GENERAL_ID for r in scoped["schedule"])

    by_date = env.client.get(
        f"/clinic-schedule/{DATE_GENERAL_ONLY}",
        query_string={"reason_id": GENERAL_ID},
        headers=AUTH,
    ).get_json()
    assert by_date["schedule"]["schedule_id"] == 99

    general_by_date = env.client.get(
        f"/clinic-schedule/{DATE_GENERAL_ONLY}", headers=AUTH
    ).get_json()
    assert general_by_date["schedule"]["schedule_id"] == 11

    created_resp = env.client.post(
        "/clinic-schedule",
        json={
            "working_date": DATE_EMPTY,
            "slot_start": "09:00",
            "slot_end": "11:00",
            "reason_id": GENERAL_ID,
        },
        headers=AUTH,
    )
    assert created_resp.status_code == 201
    created = created_resp.get_json()["schedule"]
    assert created["reason_id"] == GENERAL_ID
    assert created["working_date"] == DATE_EMPTY

    # Simulates a page reload: the reason filter finds only the saved row,
    # while the General filter sees no row on that date.
    reloaded = env.client.get(
        "/clinic-schedule",
        query_string={"reason_id": GENERAL_ID},
        headers=AUTH,
    ).get_json()
    assert {r["schedule_id"] for r in reloaded["schedule"]} == {
        99,
        created["schedule_id"],
    }
    general_reload = env.client.get("/clinic-schedule", headers=AUTH).get_json()
    assert {r["schedule_id"] for r in general_reload["schedule"]} == {10, 11}

    # Scope guard: a reason-scoped edit cannot overwrite a General row.
    before = dict(next(
        r for r in env.state.tables["clinic_schedules"]
        if r["schedule_id"] == 10
    ))
    blocked = env.client.put(
        "/clinic-schedule/id/10",
        json={"work_end": "18:00", "reason_id": GENERAL_ID},
        headers=AUTH,
    )
    assert blocked.status_code == 404
    after = next(
        r for r in env.state.tables["clinic_schedules"]
        if r["schedule_id"] == 10
    )
    assert after["work_end"] == before["work_end"]
    assert after["reason_id"] is None


def test_schedule_by_date_scopes_by_reason(env):
    general = env.client.get(f"/clinic-schedule/{DATE}", headers=AUTH)
    assert general.get_json()["schedule"]["schedule_id"] == 10

    dental = env.client.get(
        f"/clinic-schedule/{DATE}", query_string={"reason_id": DENTAL_ID},
        headers=AUTH,
    )
    assert dental.get_json()["schedule"]["schedule_id"] == 20

    # dedicated scope never falls back to the general schedule
    missing = env.client.get(
        f"/clinic-schedule/{DATE_GENERAL_ONLY}",
        query_string={"reason_id": DENTAL_ID}, headers=AUTH,
    )
    assert missing.status_code == 404

    invalid = env.client.get(
        f"/clinic-schedule/{DATE}", query_string={"reason_id": 999},
        headers=AUTH,
    )
    assert invalid.status_code == 400


def test_create_dental_schedule_does_not_touch_general(env):
    resp = env.client.post(
        "/clinic-schedule",
        json={
            "working_date": DATE_GENERAL_ONLY,
            "slot_start": "14:00",
            "slot_end": "16:00",
            "reason_id": DENTAL_ID,
        },
        headers=AUTH,
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["schedule"]["reason_id"] == DENTAL_ID
    assert body["schedule"]["working_date"] == DATE_GENERAL_ONLY

    rows = env.state.tables["clinic_schedules"]
    general = next(r for r in rows if r["schedule_id"] == 11)
    assert general["work_start"] == "08:00:00"   # untouched
    assert general["reason_id"] is None

    dental_rows = [
        r for r in rows
        if r["reason_id"] == DENTAL_ID
        and r["working_date"] == DATE_GENERAL_ONLY
    ]
    assert len(dental_rows) == 1

    # general scope still resolves the general row for that date
    got = env.client.get(
        f"/clinic-schedule/{DATE_GENERAL_ONLY}", headers=AUTH
    ).get_json()
    assert got["schedule"]["schedule_id"] == 11

    # dental rows got their own materialized slots; general untouched
    assert any(s["schedule_id"] == dental_rows[0]["schedule_id"]
               for s in env.state.tables["time_slots"])
    assert any(s["schedule_id"] == 11
               for s in env.state.tables["time_slots"])


def test_create_general_schedule_does_not_touch_dental(env):
    resp = env.client.post(
        "/clinic-schedule",
        json={
            "working_date": DATE,
            "slot_start": "09:00",
            "slot_end": "17:00",
            # no reason_id -> general scope
        },
        headers=AUTH,
    )

    assert resp.status_code == 201
    body = resp.get_json()
    # collapsed into the EXISTING general row for that date
    assert body["schedule"]["schedule_id"] == 10
    assert body["schedule"]["reason_id"] is None

    rows = env.state.tables["clinic_schedules"]
    general = next(r for r in rows if r["schedule_id"] == 10)
    assert general["work_start"] == "09:00"      # updated in place
    dental = next(r for r in rows if r["schedule_id"] == 20)
    assert dental["work_start"] == "14:00:00"    # untouched
    assert dental["reason_id"] == DENTAL_ID

    # dental children survive the general re-materialization
    slot_schedule_ids = {s["schedule_id"] for s in env.state.tables["time_slots"]}
    assert 10 in slot_schedule_ids
    assert 20 in slot_schedule_ids


def test_create_dental_schedule_collapses_only_dental_duplicates(env):
    # Legacy-style duplicate DENTAL row for the same date.
    env.state.tables["clinic_schedules"].append({
        "schedule_id": 21,
        "working_date": DATE,
        "work_start": "14:00:00",
        "work_end": "15:00:00",
        "break_start": None,
        "break_end": None,
        "is_enabled": True,
        "closure_reason": None,
        "reason_id": DENTAL_ID,
    })

    resp = env.client.post(
        "/clinic-schedule",
        json={
            "working_date": DATE,
            "slot_start": "15:00",
            "slot_end": "17:00",
            "reason_id": DENTAL_ID,
        },
        headers=AUTH,
    )

    assert resp.status_code == 201

    rows = env.state.tables["clinic_schedules"]
    ids = [r["schedule_id"] for r in rows]
    # duplicate dental row collapsed, general row untouched
    assert 21 not in ids
    assert 10 in ids
    dental = next(r for r in rows if r["schedule_id"] == 20)
    assert dental["work_start"] == "15:00"       # updated in place
    general = next(r for r in rows if r["schedule_id"] == 10)
    assert general["work_start"] == "08:00:00"   # untouched

    # general children untouched by the dental collapse/materialize
    slot_schedule_ids = {s["schedule_id"] for s in env.state.tables["time_slots"]}
    assert 10 in slot_schedule_ids


def test_update_schedule_scoped_by_reason(env):
    # scope guard: a dental-scoped update cannot modify a general row
    resp = env.client.put(
        "/clinic-schedule/id/10",
        json={"work_end": "18:00", "reason_id": DENTAL_ID},
        headers=AUTH,
    )
    assert resp.status_code == 404
    rows = env.state.tables["clinic_schedules"]
    general = next(r for r in rows if r["schedule_id"] == 10)
    assert general["work_end"] == "12:00:00"     # unchanged

    # dental row updates when scoped to dental
    resp = env.client.put(
        "/clinic-schedule/id/20",
        json={"work_end": "17:00", "reason_id": DENTAL_ID},
        headers=AUTH,
    )
    assert resp.status_code == 200
    dental = next(r for r in rows if r["schedule_id"] == 20)
    assert dental["work_end"] == "17:00"
    assert general["work_end"] == "12:00:00"     # still untouched

    # omitted reason_id keeps updating general rows (existing behaviour)
    resp = env.client.put(
        "/clinic-schedule/id/11",
        json={"work_start": "10:00"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    other_general = next(r for r in rows if r["schedule_id"] == 11)
    assert other_general["work_start"] == "10:00"

    # unknown reason -> 400
    invalid = env.client.put(
        "/clinic-schedule/id/20",
        json={"work_end": "17:00", "reason_id": 999},
        headers=AUTH,
    )
    assert invalid.status_code == 400


def test_preview_scopes_by_reason(env):
    general = env.client.get(
        "/clinic-schedule/preview", query_string={"date": DATE},
        headers=AUTH,
    ).get_json()
    assert general["success"] is True
    assert {b["start"] for b in general["blocks"]} == {
        "08:00", "08:30", "09:00", "09:30",
        "10:00", "10:30", "11:00", "11:30",
    }

    dental = env.client.get(
        "/clinic-schedule/preview",
        query_string={"date": DATE, "reason_id": DENTAL_ID},
        headers=AUTH,
    ).get_json()
    assert dental["success"] is True
    assert {b["start"] for b in dental["blocks"]} == {
        "14:00", "14:30", "15:00", "15:30",
    }

    # non-dedicated reason -> general schedule blocks (unchanged)
    consult = env.client.get(
        "/clinic-schedule/preview",
        query_string={"date": DATE, "reason_id": GENERAL_ID},
        headers=AUTH,
    ).get_json()
    assert consult["blocks"] == general["blocks"]

    # dedicated reason with no configured schedule -> empty blocks,
    # never the general schedule or default settings
    empty = env.client.get(
        "/clinic-schedule/preview",
        query_string={"date": DATE_GENERAL_ONLY, "reason_id": DENTAL_ID},
        headers=AUTH,
    ).get_json()
    assert empty["success"] is True
    assert empty["blocks"] == []

    invalid = env.client.get(
        "/clinic-schedule/preview",
        query_string={"date": DATE, "reason_id": 999},
        headers=AUTH,
    )
    assert invalid.status_code == 400


# ============================================================
# 7. Schema-mismatch / migration-required regressions
# ============================================================


def test_create_schedule_missing_reason_id_column_returns_migration_required(legacy_env):
    before = len(legacy_env.state.tables["clinic_schedules"])

    resp = legacy_env.client.post(
        "/clinic-schedule",
        json={
            "working_date": "2099-05-01",
            "slot_start": "08:00",
            "slot_end": "12:00",
        },
        headers=AUTH,
    )

    assert resp.status_code == 503
    body = resp.get_json()
    assert body["success"] is False
    assert body["migration_required"] == "migrations/2026-11-26_dental_service_schedule.sql"
    assert "reason_id" in body["error"].lower() or "migration" in body["error"].lower()
    assert len(legacy_env.state.tables["clinic_schedules"]) == before


def test_update_schedule_missing_reason_id_column_returns_migration_required(legacy_env):
    before = dict(next(r for r in legacy_env.state.tables["clinic_schedules"] if r["schedule_id"] == 10))

    resp = legacy_env.client.put(
        "/clinic-schedule/id/10",
        json={"work_end": "18:00"},
        headers=AUTH,
    )

    assert resp.status_code == 503
    body = resp.get_json()
    assert body["success"] is False
    assert body["migration_required"] == "migrations/2026-11-26_dental_service_schedule.sql"
    after = next(r for r in legacy_env.state.tables["clinic_schedules"] if r["schedule_id"] == 10)
    assert after["work_end"] == before["work_end"]


def test_create_schedule_succeeds_with_reason_scope_after_migration(env):
    resp = env.client.post(
        "/clinic-schedule",
        json={
            "working_date": "2099-05-02",
            "slot_start": "13:00",
            "slot_end": "15:00",
            "reason_id": DENTAL_ID,
        },
        headers=AUTH,
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["success"] is True
    assert body["schedule"]["reason_id"] == DENTAL_ID
    assert body["schedule"]["working_date"] == "2099-05-02"


def test_update_schedule_succeeds_with_reason_scope_after_migration(env):
    resp = env.client.put(
        "/clinic-schedule/id/20",
        json={"work_start": "13:00", "work_end": "17:00", "reason_id": DENTAL_ID},
        headers=AUTH,
    )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["schedule"]["schedule_id"] == 20

    # Editing hours must regenerate that scope's bookable children; stale
    # 14:00/14:30 slots would leave students booking times that no longer exist.
    scoped_slots = [
        slot for slot in env.state.tables["time_slots"]
        if slot.get("schedule_id") == 20
    ]
    assert not any(slot["slot_id"] in (201, 202) for slot in scoped_slots)
    assert any(str(slot["slot_start"]).startswith("13:00") for slot in scoped_slots)
    assert body["schedule"]["reason_id"] == DENTAL_ID
