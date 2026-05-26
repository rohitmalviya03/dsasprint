USE dsa_learning_platform;

ALTER TABLE problem_progress
  ADD COLUMN revision_due_on DATE NULL AFTER revision_count,
  ADD INDEX idx_progress_due (user_id, revision_due_on);
