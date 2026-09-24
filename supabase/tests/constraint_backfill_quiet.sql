-- The onboarding-text backfill is not news for the Coach: its queued
-- notifications are removed before any send; real declarations stay.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id, email) VALUES
 ('c7f00000-0000-4000-8000-000000000001', 'c7f-coach@example.test'),
 ('c7f00000-0000-4000-8000-000000000002', 'c7f-migrated@example.test'),
 ('c7f00000-0000-4000-8000-000000000003', 'c7f-real@example.test');
INSERT INTO public.user_roles(user_id, role, coaching_role) VALUES
 ('c7f00000-0000-4000-8000-000000000001', 'free', 'coach'),
 ('c7f00000-0000-4000-8000-000000000002', 'free', 'none'),
 ('c7f00000-0000-4000-8000-000000000003', 'free', 'none')
ON CONFLICT (user_id) DO UPDATE SET coaching_role = excluded.coaching_role;
INSERT INTO public.coach_client_links(coach_id, client_id, status) VALUES
 ('c7f00000-0000-4000-8000-000000000001', 'c7f00000-0000-4000-8000-000000000002', 'active'),
 ('c7f00000-0000-4000-8000-000000000001', 'c7f00000-0000-4000-8000-000000000003', 'active');

-- Same shape as the 20260924140000 backfill (created by the athlete, event « migrated »).
WITH seeded AS (
  INSERT INTO public.athlete_constraints (user_id, kind, body_area, description, persistence, created_by)
  VALUES ('c7f00000-0000-4000-8000-000000000002', 'limitation', 'other', 'Genou fragile', 'persistent', 'c7f00000-0000-4000-8000-000000000002')
  RETURNING id, user_id
)
INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, persistence, note)
SELECT id, user_id, 'declared', 'persistent', 'migrated' FROM seeded;

-- A real declaration (note left empty, as declare_constraint does).
WITH seeded AS (
  INSERT INTO public.athlete_constraints (user_id, kind, body_area, description, persistence, created_by)
  VALUES ('c7f00000-0000-4000-8000-000000000003', 'pain', 'knee', '', 'temporary', 'c7f00000-0000-4000-8000-000000000003')
  RETURNING id, user_id
)
INSERT INTO public.athlete_constraint_events (constraint_id, user_id, change, persistence, note)
SELECT id, user_id, 'declared', 'temporary', '' FROM seeded;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.notification_outbox
       WHERE user_id = 'c7f00000-0000-4000-8000-000000000001' AND kind = 'constraint_declared') <> 2 THEN
    RAISE EXCEPTION 'fixture: both inserts should have queued a notification';
  END IF;
END $$;

\ir ../migrations/20260924210000_constraint_backfill_quiet.sql
\ir ../migrations/20260924210000_constraint_backfill_quiet.sql

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_outbox WHERE dedupe_key = 'constraint:c7f00000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'backfilled constraint still notifies the coach';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_outbox WHERE dedupe_key = 'constraint:c7f00000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'real declaration notification removed';
  END IF;
END $$;

ROLLBACK;
\echo 'constraint backfill quiet: migrated onboarding text never notifies the coach, real declarations still do, idempotent'
