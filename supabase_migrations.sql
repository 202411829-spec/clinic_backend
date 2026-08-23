-- Supabase migrations for modules that need tables not present in the
-- original schema. Run each block once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query).

-- ============================================================
-- FEEDBACK (student clinic-visit ratings)
-- Used by routers/feedback.py and the student Feedback page.
-- ============================================================

create table if not exists feedback (
    feedback_id bigint generated always as identity primary key,
    student_id  text        not null,
    rating      int         not null check (rating between 1 and 5),
    message     text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_student
    on feedback (student_id, created_at desc);

alter table feedback enable row level security;

-- Backend uses the service-role key (bypasses RLS). These policies let
-- authenticated users read/write their own feedback if you later move
-- writes client-side.
drop policy if exists "feedback_select_own" on feedback;
create policy "feedback_select_own"
    on feedback for select
    using (true);

drop policy if exists "feedback_insert_any" on feedback;
create policy "feedback_insert_any"
    on feedback for insert
    with check (true);
