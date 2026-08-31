/*
  Check-in subjective ratings: 1–5 → 0–10.

  New client submissions are integers 0–10 inclusive.
  Existing 1–5 rows are left as stored (no rewrite / no ×2 in the table).
*/

DO $$
DECLARE
  col text;
  cons text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'hunger',
    'fatigue',
    'sleep_quality',
    'stress',
    'motivation',
    'muscle_soreness',
    'joint_pain',
    'energy_level',
    'mood'
  ]
  LOOP
    FOR cons IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'daily_checkins'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ~* ('\m' || col || '\M')
    LOOP
      EXECUTE format('ALTER TABLE daily_checkins DROP CONSTRAINT IF EXISTS %I', cons);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE daily_checkins ADD CONSTRAINT daily_checkins_%s_check CHECK (%I IS NULL OR (%I >= 0 AND %I <= 10))',
      col, col, col, col
    );
  END LOOP;
END $$;
