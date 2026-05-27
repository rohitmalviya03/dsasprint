ALTER TABLE mock_interviews
  ADD COLUMN availability_id BIGINT NULL AFTER interviewer_id,
  ADD INDEX idx_mock_availability (availability_id);
