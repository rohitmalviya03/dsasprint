ALTER TABLE users
  ADD COLUMN account_role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER provider;

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

CREATE TABLE IF NOT EXISTS mock_interviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  interview_track ENUM('DSA','Development') NOT NULL DEFAULT 'DSA',
  interview_mode ENUM('AI','Person') NOT NULL DEFAULT 'Person',
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
