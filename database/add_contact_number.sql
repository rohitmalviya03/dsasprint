USE dsa_learning_platform;

ALTER TABLE users
  ADD COLUMN contact_number VARCHAR(24) NULL AFTER email;
