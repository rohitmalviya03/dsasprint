CREATE TABLE IF NOT EXISTS mock_interviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  interview_track ENUM('DSA','Development') NOT NULL DEFAULT 'DSA',
  interview_mode ENUM('AI','Person') NOT NULL DEFAULT 'AI',
  focus_area VARCHAR(80) NOT NULL,
  interview_type ENUM('Technical','Behavioral','Mixed') NOT NULL DEFAULT 'Technical',
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  notes VARCHAR(500) NULL,
  status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mock_user_schedule (user_id, scheduled_at),
  CONSTRAINT fk_mock_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_mock_duration CHECK (duration_minutes IN (30, 45, 60, 90))
);
