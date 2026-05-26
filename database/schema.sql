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
  status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mock_user_schedule (user_id, scheduled_at),
  CONSTRAINT fk_mock_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_mock_duration CHECK (duration_minutes IN (30, 45, 60, 90))
);
