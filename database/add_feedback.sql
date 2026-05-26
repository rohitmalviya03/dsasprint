USE dsa_learning_platform;

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
