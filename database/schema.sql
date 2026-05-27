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
  account_role ENUM('user','admin') NOT NULL DEFAULT 'user',
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
  interview_track ENUM('DSA','Development') NOT NULL DEFAULT 'DSA',
  interview_mode ENUM('AI','Person') NOT NULL DEFAULT 'AI',
  focus_area VARCHAR(80) NOT NULL,
  interview_type ENUM('Technical','Behavioral','Mixed') NOT NULL DEFAULT 'Technical',
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  notes VARCHAR(500) NULL,
  status ENUM('Requested','Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Requested',
  assigned_to VARCHAR(120) NULL,
  interviewer_email VARCHAR(190) NULL,
  meeting_link TEXT NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mock_user_schedule (user_id, scheduled_at),
  CONSTRAINT fk_mock_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
