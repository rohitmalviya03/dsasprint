ALTER TABLE users
  MODIFY COLUMN account_role ENUM('user','admin','interviewer') NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS interviewer_profiles (
  user_id CHAR(36) PRIMARY KEY,
  headline VARCHAR(150) NULL,
  company VARCHAR(120) NULL,
  experience_years SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  expertise VARCHAR(500) NOT NULL,
  linkedin_url TEXT NULL,
  bio TEXT NULL,
  google_calendar_refresh_token TEXT NULL,
  google_calendar_email VARCHAR(190) NULL,
  google_calendar_connected_at TIMESTAMP NULL DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by CHAR(36) NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_interviewer_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_interviewer_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS interviewer_availability (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  interviewer_id CHAR(36) NOT NULL,
  available_from DATETIME NOT NULL,
  available_to DATETIME NOT NULL,
  status ENUM('Available','Booked','Unavailable') NOT NULL DEFAULT 'Available',
  notes VARCHAR(200) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_availability_interviewer_time (interviewer_id, available_from),
  CONSTRAINT fk_availability_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_availability_times CHECK (available_to > available_from)
);

ALTER TABLE mock_interviews
  ADD COLUMN interviewer_id CHAR(36) NULL AFTER user_id,
  ADD COLUMN availability_id BIGINT NULL AFTER interviewer_id,
  ADD COLUMN assignment_status ENUM('Pending','Accepted','Declined') NULL AFTER status,
  ADD COLUMN assigned_at TIMESTAMP NULL AFTER assignment_status,
  ADD INDEX idx_mock_interviewer_schedule (interviewer_id, scheduled_at),
  ADD INDEX idx_mock_availability (availability_id),
  ADD CONSTRAINT fk_mock_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS interview_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  interview_id BIGINT NOT NULL UNIQUE,
  interviewer_id CHAR(36) NOT NULL,
  problem_solving_score TINYINT UNSIGNED NOT NULL,
  communication_score TINYINT UNSIGNED NOT NULL,
  coding_quality_score TINYINT UNSIGNED NOT NULL,
  fundamentals_score TINYINT UNSIGNED NOT NULL,
  strengths TEXT NOT NULL,
  improvement_areas TEXT NOT NULL,
  recommended_practice TEXT NOT NULL,
  recommendation ENUM('Needs Practice','Interview Ready','Strong Candidate') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_interview_feedback_interview FOREIGN KEY (interview_id) REFERENCES mock_interviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_feedback_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_interview_feedback_scores CHECK (
    problem_solving_score BETWEEN 1 AND 5 AND communication_score BETWEEN 1 AND 5
    AND coding_quality_score BETWEEN 1 AND 5 AND fundamentals_score BETWEEN 1 AND 5
  )
);
