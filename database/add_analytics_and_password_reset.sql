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

INSERT INTO practice_activity (user_id, problem_id, activity_date, practice_count, last_practiced_at)
SELECT user_id, problem_id, DATE(COALESCE(last_visited_at, updated_at)), 1, COALESCE(last_visited_at, updated_at)
FROM problem_progress
WHERE COALESCE(last_visited_at, updated_at) IS NOT NULL
ON DUPLICATE KEY UPDATE last_practiced_at = GREATEST(last_practiced_at, VALUES(last_practiced_at));

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
