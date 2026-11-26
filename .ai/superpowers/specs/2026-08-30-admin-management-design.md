# Admin Management (Management → Admins) — Architectural Design Spec

**Date:** 2026-08-30
**Project:** Gordon College Clinic Appointment System
**Stack:** Flask + Supabase (backend) · React 18 + Vite + Tailwind PWA (frontend)
**Status:** Approved Design — Ready for Implementation
**Route Prefix:** `/admin/admins` (admin-only) · `/admin/signup` (public hidden)

---

## 1. Overview

Admin Management allows any active admin to maintain the clinic admin roster under **Management → Admins**. It introduces an **allowlist pattern** with no new tables:

1. An active admin adds an email + role (`nurse` | `doctor`) → creates a pending row in `admin_accounts` (`is_active=false`, no auth user).
2. The invited person visits the hidden `/admin/signup` page, proves allowlist membership + pending status, receives a 6-digit code, and creates their Supabase auth user + `app_accounts` row. On success `is_active` flips to `true`.
3. The Admins list surfaces three states (pending / active / inactive) with Deactivate, Activate, and hard Delete actions. Self-delete is blocked and hard delete requires email confirmation.

The design follows the approach approved 2026-08-30 and intentionally keeps the roster entirely in existing tables.

---

## 2. Goals / Non-Goals

### Goals

- Provide self-service admin roster management without DB migrations or new tables.
- Support invite-then-signup lifecycle: pending → active → inactive → (reactivate or hard delete).
- Enforce `@gordoncollege.edu.ph` domain and `nurse`/`doctor` role enum at API and UI.
- Reuse existing masterlist pagination/search and SMTP → Resend email fallback patterns.
- Keep `/admin/signup` hidden (unlinked) but functional for any allowlisted pending invite.

### Non-Goals

- No new tables, views, or migrations.
- No role-based permission tiers beyond the `nurse`/`doctor` label (any active admin can manage any other admin).
- No bulk import / CSV upload.
- No admin password-reset flow in this spec (reuse existing forgot-password if needed).
- No public discovery of `/admin/signup` from nav or landing pages.

---

## 3. Data Model (Data & States)

### 3.1 Tables — No New Tables

**`admin_accounts`** (PK `admin_id`)

| Column | Type / Constraint | Notes |
|---|---|---|
| `admin_id` | PK (bigint / uuid per existing schema) | Auto-generated |
| `username` | text UNIQUE | Derived as email local-part (`email.split('@')[0]`) at invite time |
| `email` | text UNIQUE | Must be `@gordoncollege.edu.ph` |
| `first_name` | text | Nullable until profile completion |
| `last_name` | text | Nullable until profile completion |
| `role` | text | Enum `nurse` \| `doctor` (chosen by inviting admin) |
| `license_no` | text | Nullable, edited via Admin Profile |
| `is_active` | boolean | `false` = pending/inactive, `true` = active |

**`app_accounts`** (PK `auth_user_id` UNIQUE, `email` UNIQUE)

| Column | Type / Constraint | Notes |
|---|---|---|
| `auth_user_id` | uuid UNIQUE (Supabase `auth.users.id`) | Created at signup |
| `email` | text UNIQUE | Mirrors `admin_accounts.email` |
| `account_type` | text | Always `'admin'` for this flow |
| `admin_id` | FK → `admin_accounts.admin_id` | Links auth identity to roster row |

> No schema changes. `admin_accounts` is the allowlist + roster; `app_accounts` is the auth binding. `auth.users` is managed via Supabase Admin API.

### 3.2 Lifecycle / States

```
[Invite] POST /api/admins {email, role}
    → admin_accounts {email, username=email_local, role, is_active=false}
    → NO auth.users row, NO app_accounts row
    → List status = "pending"

[Signup] POST /api/auth/admin/signup {email, code, password}
    → verify allowlisted + pending + code valid
    → admin.create_user(email, password, email_confirm:true)
    → app_accounts {auth_user_id, email, account_type:'admin', admin_id}
    → admin_accounts.is_active = true
    → List status = "active"

[Deactivate] PATCH /api/admins/:id/deactivate
    → admin_accounts.is_active = false
    → List status = "inactive" (login blocked via is_active check)

[Activate] PATCH /api/admins/:id/activate
    → admin_accounts.is_active = true
    → List status = "active"

[Hard Delete] DELETE /api/admins/:id {confirmEmail}
    → requires confirmEmail === row email
    → deletes auth.users via admin.delete_user(auth_user_id) if exists
    → deletes app_accounts row
    → deletes admin_accounts row
    → self-delete blocked (id/email matches caller)
```

**Status derivation for list response:**

| `is_active` | `app_accounts` exists | Display status |
|---|---|---|
| `false` | no | `pending` |
| `true` | yes | `active` |
| `false` | yes | `inactive` |

---

## 4. API Spec (Backend)

### 4.1 Conventions

- Base URL: same Flask app as existing routers. Service-role Supabase client (`database.supabase` / `supabase_client.supabase`) bypasses RLS; all writes via `execute_with_retry()`.
- Auth: `require_admin` on `/api/admins/*` (any active admin, i.e. `admin_accounts.is_active=true` + valid `app_accounts` binding). Students not in `admin_accounts` are blocked at `check-email`.
- Error envelope: `{ "success": false, "error": "..." }` with status codes 400/401/403/404/409/500. Success: `{ "success": true, ... }`.
- Email domain validated server-side: must end with `@gordoncollege.edu.ph` (case-insensitive trim).

### 4.2 Endpoints

#### `GET /api/admins` — List admins

- **Auth:** `require_admin`
- **Query:** `page` (default 1), `page_size` (default 20, max 100), `search` (substring on email/username/first_name/last_name/role)
- **Behavior:** Reuse masterlist pattern — filter in Python or via Supabase `or_` with `sanitize_search`; paginate; compute `status` per row as above.
- **Response:** `200 { success, count, total, page, page_size, admins: [{ admin_id, username, email, first_name, last_name, role, license_no, is_active, status }] }`

#### `POST /api/admins` — Add allowlist entry

- **Auth:** `require_admin`
- **Body:** `{ email: string, role: 'nurse'|'doctor' }`
- **Validation:**
  - `email` required, trimmed, lowercased, must match `@gordoncollege.edu.ph` → else 400.
  - `role` required, enum `nurse`/`doctor` → else 400 with inline alert.
  - Duplicate `email` or `username` (local-part) → 409.
- **Behavior:** Insert `admin_accounts { email, username=email_local, role, is_active=false }`. No auth user, no `app_accounts`.
- **Response:** `201 { success, message, admin }` · Errors: 400/409/500.

#### `POST /api/auth/admin/check-email` — Gate for hidden signup

- **Auth:** public (no token)
- **Body:** `{ email }`
- **Behavior:** Lookup `admin_accounts` by email (case-insensitive).
  - Not found → `404 { success:false, error:"Not invited" }`
  - Found but `is_active=true` + `app_accounts` exists → `409 { success:false, error:"Already active" }`
  - Found + `is_active=false` (pending or inactive without active auth) → `200 { success:true, invited:true, status }`
- **Note:** Students not in `admin_accounts` are blocked here (404). This is the allowlist gate.

#### `POST /api/auth/admin/send-code` — Send 6-digit code

- **Auth:** public but gated by `check-email` result (server re-validates allowlisted + pending)
- **Body:** `{ email }`
- **Behavior:**
  - Re-validate `admin_accounts` is allowlisted and pending (`is_active=false` and no active `app_accounts`).
  - Generate 6-digit numeric code, store in in-memory dict `_admin_signup_codes[email] = { code, expires_at }` with **5-minute TTL**.
  - Send via `_send_email_via_smtp(to, subject, code)` then **Resend fallback** on failure (same pattern as existing forgot-password flow).
  - Rate-limit: max 3 sends per email per 15 minutes (in-memory counter).
- **Response:** `200 { success, message:"Code sent" }` · Errors: 404/409/429/500.

#### `POST /api/auth/admin/signup` — Verify code + create auth user

- **Auth:** public
- **Body:** `{ email, code, password, confirmPassword }`
- **Validation:** `password` ≥ 8 chars, `password === confirmPassword` → 400 otherwise; `code` 6 digits → 400 if malformed.
- **Behavior:**
  1. Verify `_admin_signup_codes[email]` exists, not expired (5 min), `code` matches (one-time use → delete on success or on expiry).
  2. Re-validate `admin_accounts` still pending.
  3. Create Supabase auth user via service-role: `supabase.auth.admin.create_user({ email, password, email_confirm: true })`.
  4. Insert `app_accounts { auth_user_id, email, account_type:'admin', admin_id }`.
  5. Update `admin_accounts.is_active = true`.
  6. On any step failure, rollback created auth user if needed; return 500 with `error`.
- **Response:** `201 { success, message:"Admin account created", admin, user }` · Errors: 400/404/409/500.

#### `PATCH /api/admins/:id/deactivate` — Soft deactivate

- **Auth:** `require_admin`
- **Params:** `id` = `admin_id`
- **Behavior:** Set `admin_accounts.is_active = false`. No auth/app_accounts deletion. Idempotent handling: if already inactive → 200 with message.
- **Response:** `200 { success, message, admin }` · Errors: 404/500.

#### `PATCH /api/admins/:id/activate` — Reactivate

- **Auth:** `require_admin`
- **Params:** `id` = `admin_id`
- **Behavior:** Set `admin_accounts.is_active = true`. Requires existing `app_accounts` (else 409 "Pending — must complete signup").
- **Response:** `200 { success, message, admin }` · Errors: 404/409/500.

#### `DELETE /api/admins/:id` — Hard delete

- **Auth:** `require_admin`
- **Params:** `id` = `admin_id`
- **Body:** `{ confirmEmail: string }`
- **Guards:**
  - `confirmEmail` required and must equal row `email` (case-insensitive) → else 400.
  - Self-delete blocked: if `id` or `email` matches caller (`g.user.id` / `g.user.email`) → 403.
- **Behavior:** If `app_accounts` exists, delete Supabase auth user via `supabase.auth.admin.delete_user(auth_user_id)`. Then delete `app_accounts` row, then `admin_accounts` row.
- **Response:** `200 { success, message }` · Errors: 400/403/404/500.

---

## 5. Frontend

### 5.1 Navigation

- **File:** `src/data/adminNav.js` — add `Admins` entry after `Reports` (before any Management group end).
- **File:** `src/components/layout/Sidebar.jsx` — render new nav item with `shield` or `users` icon.
- **Guard:** `AdminLayout` already requires admin; no change.

### 5.2 Admins Page — `/admin/admins` under `AdminLayout`

- **Files:** `src/pages/admin/Admins.jsx` (route wrapper), `src/components/admin/AdminsPanel.jsx` (table + logic), `src/components/admin/AddAdminModal.jsx` (modal form).
- **Table columns:** `Name` (first_name + last_name or `—` if pending), `Email`, `Role` (badge `nurse`/`doctor`), `Status` (badge `pending`/`active`/`inactive`), `License No.` (or `—`), `Actions`.
- **Actions:**
  - Primary: `Deactivate` (when active) / `Activate` (when inactive/pending with auth). Calls `PATCH /api/admins/:id/deactivate` or `.../activate`.
  - Overflow (`...` menu): `Delete` → confirm modal requiring typed email (`confirmEmail`) → `DELETE /api/admins/:id`.
  - Self-row: `Delete` disabled with tooltip "Cannot delete yourself".
- **Add Admin modal:** Fields `Email` (text, placeholder `name@gordoncollege.edu.ph`) + `Role` dropdown (`nurse`/`doctor` only). No password, no name fields. Submit → `POST /api/admins`. Inline role alert on 400, duplicate 409 toast.
- **Search + pagination:** Text input `search` (debounced) → `GET /api/admins?search=&page=&page_size=`; pagination controls reuse masterlist pattern (`page`, `page_size`, `total`).
- **API client:** `src/lib/api.js` add `adminsApi: { list, add, deactivate, activate, remove }` and `adminAuthApi: { checkEmail, sendCode, signup }`.

### 5.3 Hidden Signup — `/admin/signup` (public)

- **File:** `src/pages/auth/AdminSignUp.jsx` (lazy-loaded in `App.jsx` outside `AdminLayout` / `RequireAuth`).
- **Flow — 3 steps, gated by `check-email`:**
  1. **Email step:** Input email → `POST /api/auth/admin/check-email`. On 404 show "Not invited", on 409 show "Already active — please log in", on 200 proceed.
  2. **Code step:** Auto-call `POST /api/auth/admin/send-code {email}` on entry to step 2; show 6-digit code input + resend (rate-limited). Code TTL 5 min, one-time.
  3. **Password step:** `password` + `confirmPassword` (≥8 chars, match) → `POST /api/auth/admin/signup {email, code, password, confirmPassword}`.
- **On success:** Auto-login via existing `adminSignIn(email, password)` (Supabase sign-in) → redirect to Admin Profile (`/admin/profile` or record route).
- **No nav link:** Route exists but is not listed in `adminNav.js`, `Sidebar.jsx`, or landing pages.

### 5.4 Admin Profile — `/admin/profile` (or record)

- **Existing page:** Extend to show `Name` (first_name + last_name, editable), `License No.` (editable), `Role` (read-only badge; or editable by *other* admins via Admins table — not self-editable).
- **No hard gate:** If `first_name`/`last_name`/`license_no` empty, show banner "Complete your profile" but do not block navigation.
- **Save:** `PATCH /api/admins/:id` or existing profile update endpoint (if exists) — reuse current profile save pattern.

### 5.5 Routing — `App.jsx`

- Lazy imports: `const Admins = lazy(() => import('./pages/admin/Admins.jsx'))`, `const AdminSignUp = lazy(() => import('./pages/auth/AdminSignUp.jsx'))`.
- Routes:
  ```jsx
  <Route path="/admin/signup" element={<AdminSignUp />} />
  <Route element={<AdminLayout />}>
    <Route path="/admin/admins" element={<Admins />} />
  </Route>
  ```

---

## 6. Architecture & Security

### 6.1 Backend Placement

- **New router:** `routers/admin_mgmt.py` — owns `GET /api/admins`, `POST /api/admins`, `PATCH /api/admins/:id/deactivate`, `PATCH /api/admins/:id/activate`, `DELETE /api/admins/:id`. Registered in `main.py` with `url_prefix="/api"`.
- **Reuse router:** `routers/auth.py` — add `POST /api/auth/admin/check-email`, `POST /api/auth/admin/send-code`, `POST /api/auth/admin/signup`. Keeps auth concerns together; reuses existing `_send_email_via_smtp` and Resend fallback helpers.
- **State:** Separate in-memory dict `_admin_signup_codes: dict[str, {code, expires_at, send_count, window_start}]` (isolated from student signup codes; no cross-contamination).
- **Supabase:** All DB access via service-role client + `execute_with_retry()`. Auth user creation/deletion via `supabase.auth.admin.create_user` / `delete_user`.

### 6.2 Frontend Placement

- **Pages:** `src/pages/admin/Admins.jsx`, `src/pages/auth/AdminSignUp.jsx`
- **Components:** `src/components/admin/AdminsPanel.jsx`, `src/components/admin/AddAdminModal.jsx`
- **Lib:** `src/lib/api.js` extensions (`adminsApi`, `adminAuthApi`)
- **Lazy loading:** Both pages lazy in `App.jsx` to keep initial bundle small.

### 6.3 Security

| Control | Detail |
|---|---|
| `require_admin` on `/api/admins/*` | Any active admin (`admin_accounts.is_active=true` + `app_accounts` binding) can manage roster. No student can call these. |
| Allowlist gate at `check-email` | Students not in `admin_accounts` receive 404 at step 1; `send-code` and `signup` re-validate allowlist server-side. |
| Domain validation | `@gordoncollege.edu.ph` enforced server-side on `POST /api/admins` and on `signup`; client also validates before submit. |
| Code TTL + one-time | 6-digit code, 5-minute expiry, deleted after successful `signup` or on expiry. |
| Rate-limit | `send-code` max 3 per email per 15 min; `check-email` and `signup` also throttled by existing global limiter if present. |
| Self-delete guard | `DELETE /api/admins/:id` compares `id` and `email` against `g.user`; 403 if self. |
| Confirm email on hard delete | `DELETE` body `confirmEmail` must equal row email; prevents accidental clicks. |
| No open registration | `/admin/signup` is public but useless without a prior `POST /api/admins` invite; no way to self-enroll. |

---

## 7. Error Handling

| Scenario | Status | Response / UI |
|---|---|---|
| Duplicate email on `POST /api/admins` | 409 | `{ success:false, error:"Email already exists" }` → toast + inline field error |
| Invalid domain | 400 | `{ success:false, error:"Email must be @gordoncollege.edu.ph" }` → inline under Email |
| Invalid role | 400 | `{ success:false, error:"Role must be nurse or doctor" }` → inline alert under Role |
| Not invited at `check-email` | 404 | `{ success:false, error:"Not invited" }` → step 1 error "This email is not on the admin allowlist." |
| Already active at `check-email` | 409 | `{ success:false, error:"Already active" }` → "Already active — please log in." with link to `/admin/login` |
| Code expired / mismatch at `signup` | 400 | `{ success:false, error:"Invalid or expired code" }` → code field error + resend CTA |
| Password mismatch / too short | 400 | `{ success:false, error:"Passwords must match and be at least 8 characters" }` → inline |
| Deactivate/Activate missing row | 404 | `{ success:false, error:"Admin not found" }` |
| Activate pending without auth | 409 | `{ success:false, error:"Pending — must complete signup" }` |
| Delete without confirmEmail | 400 | `{ success:false, error:"Please type the admin email to confirm" }` |
| Delete self | 403 | `{ success:false, error:"Cannot delete yourself" }` |
| Generic 500 | 500 | `{ success:false, error:"Unexpected error" }` → toast, log server-side |

---

## 8. Testing

### 8.1 Backend (Python)

- `python -m py_compile routers/admin_mgmt.py routers/auth.py` — zero syntax errors.
- `GET /api/admins` with valid admin JWT → 200 with `admins` array; with student JWT → 403.
- `POST /api/admins` duplicate email → 409; invalid domain → 400; invalid role → 400.
- Lifecycle: `POST /api/admins` (pending) → `POST /api/auth/admin/check-email` (200) → `POST /api/auth/admin/send-code` (200) → `POST /api/auth/admin/signup` (201) → verify `is_active=true` and `app_accounts` exists → `GET /api/admins` shows `active`.
- `PATCH /api/admins/:id/deactivate` → `is_active=false`; `PATCH .../activate` → `is_active=true`.
- `DELETE /api/admins/:id` without `confirmEmail` → 400; with self email → 403; with correct confirmEmail (other admin) → 200 and verify all three rows deleted.

### 8.2 Frontend

- `npm run build` → 0 errors.
- Manual: Add admin → row appears as `pending` → visit `/admin/signup` → email → code → password → success → auto-login → Admin Profile → verify `GET /api/admins` now shows `active`.
- Manual: Deactivate → badge `inactive` → Activate → `active` → Delete (other admin) with confirm modal → row removed.

---

## 9. Rollout

1. Merge spec (this file) to `main`.
2. Implement `routers/admin_mgmt.py` + extend `routers/auth.py` + register in `main.py`.
3. Implement frontend pages/components + `api.js` extensions + lazy routes in `App.jsx` + nav in `adminNav.js`/`Sidebar.jsx`.
4. Deploy backend; run backend checks (`py_compile`, lifecycle curl with admin/student JWTs).
5. Deploy frontend; run `npm run build` and manual invite → signup → active flow.
6. No migration or env change required (reuses existing SMTP/Resend config).

---

## 10. Open Questions

*None — design approved as written. Any new question must be recorded here via amendment before implementation.*

---

*End of spec — 2026-08-30. Authoritative for Admin Management (Management → Admins) implementation.*
