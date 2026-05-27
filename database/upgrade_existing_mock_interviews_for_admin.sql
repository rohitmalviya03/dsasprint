ALTER TABLE mock_interviews
  MODIFY COLUMN status ENUM('Requested','Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Requested',
  ADD COLUMN assigned_to VARCHAR(120) NULL AFTER status,
  ADD COLUMN interviewer_email VARCHAR(190) NULL AFTER assigned_to,
  ADD COLUMN meeting_link TEXT NULL AFTER interviewer_email,
  ADD COLUMN admin_notes TEXT NULL AFTER meeting_link;
