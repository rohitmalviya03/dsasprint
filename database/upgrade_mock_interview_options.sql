ALTER TABLE mock_interviews
  ADD COLUMN interview_track ENUM('DSA','Development') NOT NULL DEFAULT 'DSA' AFTER user_id,
  ADD COLUMN interview_mode ENUM('AI','Person') NOT NULL DEFAULT 'AI' AFTER interview_track;
