ALTER TABLE interviewer_profiles
  ADD COLUMN google_calendar_refresh_token TEXT NULL AFTER bio,
  ADD COLUMN google_calendar_email VARCHAR(190) NULL AFTER google_calendar_refresh_token,
  ADD COLUMN google_calendar_connected_at TIMESTAMP NULL DEFAULT NULL AFTER google_calendar_email;
