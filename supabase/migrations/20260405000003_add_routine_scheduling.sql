/*
  # Add routine scheduling

  Allows users to assign days of the week to a routine and set an optional
  push-notification reminder time.

  1. Changes
    - Add `scheduled_days integer[]` — JS day numbers (0=Sun … 6=Sat)
    - Add `notification_time text`   — UTC "HH:MM" used by send-daily-reminders
*/

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS scheduled_days integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_time text DEFAULT NULL;
