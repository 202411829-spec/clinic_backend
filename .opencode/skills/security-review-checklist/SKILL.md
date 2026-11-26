---
name: security-review-checklist
description: Use when reviewing or implementing changes that touch auth, secrets, user input, database access, CORS/config, file handling, or other security-sensitive behavior in this Flask/React/Supabase project.
---

# Security Review Checklist

Use this as a focused checklist, not a license for aggressive scanning. Test only systems the user owns or explicitly asked about.

## Auth and authorization

- Verify every protected route/action checks identity and role/permission, not just authentication.
- Confirm frontend guards are UX only; backend must enforce authorization.
- Check token/session handling, expiry, and failure paths return safe errors.

## Input and output safety

- Validate and normalize input at boundaries (type, length, format, allowed values).
- Avoid SQL/string query concatenation with untrusted input; use parameterized/query-builder patterns.
- Encode/escape untrusted output in UI; avoid unsafe HTML injection paths.
- Treat file uploads, URLs, and redirects as untrusted.

## Secrets and sensitive data

- Never hardcode, log, print, or commit secrets, tokens, keys, or credentials.
- Use `.env.example` for names only; keep real values in env/secret stores.
- Check error responses/logs for leaked stack traces, secrets, or personal data.

## Supabase / data integrity

- Prefer least-privilege keys: service role only where server-side and necessary.
- Confirm RLS/policies and server-side checks align; do not rely on client-side filtering for protection.
- For writes/migrations: assess reversibility, backups/rollback, and data-loss risk before execution.

## Flask / web config

- Review CORS origins, credentials, and allowed methods/headers for least privilege.
- Check debug/config flags, cookie/session settings, CSRF exposure where applicable, and security headers as relevant.
- Confirm rate/abuse considerations for auth, OTP/email, and expensive endpoints.

## Verification discipline

- Classify findings as Critical/High/Medium/Low with `file:line`, impact, and one-line fix.
- Report PASS/FAIL/BLOCKED with observed evidence; do not implement fixes unless explicitly asked.
- Escalate to L3 for auth/security, schema/migrations, secret handling, destructive ops, or broad refactors.
