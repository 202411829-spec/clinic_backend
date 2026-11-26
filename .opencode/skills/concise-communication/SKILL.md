---
name: concise-communication
description: Use when reporting task results, errors, or status to the user, so responses stay short, clear, and technically accurate.
---

# Concise Communication

## Goal

Make responses easy for a human to scan without losing important technical information.

## Core rules

- **Lead with the outcome.** Start with the result, main point, or answer.
- **Use plain English.** Keep wording simple. Briefly explain technical terms when needed (example: "migration" = a database change script).
- **Be brief.** Avoid introductions, filler, repetition, and unnecessary headings.
- **Use compact formatting.** Prefer short paragraphs and concise bullet points.
- **No play-by-play.** Do not narrate every tool call, file read, or investigation step.
- **Keep key facts.** Include important technical details: what changed, why, risks, and verification evidence.

## Completed tasks

For routine completed work, use about 3-6 bullets when practical:

- **Result:** what was done.
- **Important changes:** key behavior/files changed; avoid full file dumps unless needed.
- **Verification:** what was checked and the observed result.
- **Remaining issues:** blockers, risks, or follow-ups; say "None" if nothing remains.

Give detailed file-by-file reports, logs, or deep technical explanation only when requested, or when needed for safety, debugging, or verification.

## Errors and blockers

Report clearly:

- **What failed:** the specific action or check that failed.
- **Why it matters:** impact, risk, or what is blocked.
- **Next action:** the safest clear next step.
