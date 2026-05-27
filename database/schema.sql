CREATE DATABASE IF NOT EXISTS dsa_learning_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dsa_learning_platform;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  contact_number VARCHAR(24) NULL,
  password_hash VARCHAR(255) NULL,
  google_id VARCHAR(120) NULL UNIQUE,
  avatar_url TEXT NULL,
  provider ENUM('local','google') NOT NULL DEFAULT 'local',
  account_role ENUM('user','admin','interviewer') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problem_progress (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  problem_id VARCHAR(120) NOT NULL,
  status ENUM('Not Attempted','Learning','Revision','Solved') NOT NULL DEFAULT 'Not Attempted',
  notes TEXT NULL,
  bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  revision_count INT NOT NULL DEFAULT 0,
  revision_due_on DATE NULL,
  last_visited_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_problem (user_id, problem_id),
  INDEX idx_progress_user (user_id),
  INDEX idx_progress_due (user_id, revision_due_on),
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS practice_activity (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  problem_id VARCHAR(120) NOT NULL,
  activity_date DATE NOT NULL,
  practice_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_practiced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activity_user_problem_date (user_id, problem_id, activity_date),
  INDEX idx_activity_user_date (user_id, activity_date),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reset_user_created (user_id, created_at),
  INDEX idx_reset_expires (expires_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  category ENUM('Feature request','Bug report','Experience','Other') NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feedback_user_created (user_id, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS mock_interviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  interviewer_id CHAR(36) NULL,
  availability_id BIGINT NULL,
  interview_track ENUM('DSA','Development') NOT NULL DEFAULT 'DSA',
  interview_mode ENUM('AI','Person') NOT NULL DEFAULT 'Person',
  focus_area VARCHAR(80) NOT NULL,
  interview_type ENUM('Technical','Behavioral','Mixed') NOT NULL DEFAULT 'Technical',
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  notes VARCHAR(500) NULL,
  status ENUM('Requested','Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Requested',
  assignment_status ENUM('Pending','Accepted','Declined') NULL,
  assigned_at TIMESTAMP NULL,
  assigned_to VARCHAR(120) NULL,
  interviewer_email VARCHAR(190) NULL,
  meeting_link TEXT NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mock_user_schedule (user_id, scheduled_at),
  INDEX idx_mock_interviewer_schedule (interviewer_id, scheduled_at),
  INDEX idx_mock_availability (availability_id),
  CONSTRAINT fk_mock_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mock_interviewer FOREIGN KEY (interviewer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_mock_duration CHECK (duration_minutes IN (30, 45, 60, 90))
);

CREATE TABLE IF NOT EXISTS admin_problems (
  problem_key VARCHAR(80) PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  difficulty ENUM('Easy','Medium','Hard') NOT NULL,
  rating VARCHAR(50) NOT NULL,
  companies VARCHAR(500) NOT NULL,
  article TEXT NOT NULL,
  video TEXT NOT NULL,
  initial_status ENUM('Not Attempted','Learning','Revision','Solved') NOT NULL DEFAULT 'Not Attempted',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_problem_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS study_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  duration_days INT UNSIGNED NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_plan_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS study_plan_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  study_plan_id BIGINT NOT NULL,
  problem_id VARCHAR(120) NOT NULL,
  day_number INT UNSIGNED NOT NULL,
  item_order INT UNSIGNED NOT NULL,
  INDEX idx_plan_items_plan_day (study_plan_id, day_number, item_order),
  CONSTRAINT fk_plan_items_plan FOREIGN KEY (study_plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interviewer_profiles (
  user_id CHAR(36) PRIMARY KEY,
  headline VARCHAR(150) NULL,
  company VARCHAR(120) NULL,
  experience_years SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  expertise VARCHAR(500) NOT NULL,
  linkedin_url TEXT NULL,
  bio TEXT NULL,
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
