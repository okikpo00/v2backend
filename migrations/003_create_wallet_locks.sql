-- 003_create_wallet_locks.sql

-- =========================
-- CREATE TABLE SAFELY
-- =========================
CREATE TABLE IF NOT EXISTS wallet_locks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,

  wallet_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,

  amount DECIMAL(18,2) NOT NULL,

  reference_type ENUM(
    'entry',
    'withdrawal',
    'h2h'
  ) NOT NULL,

  reference_id BIGINT NOT NULL,

  status ENUM(
    'active',
    'consumed',
    'released'
  ) DEFAULT 'active',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_wallet (wallet_id),
  INDEX idx_reference (reference_type, reference_id)
);