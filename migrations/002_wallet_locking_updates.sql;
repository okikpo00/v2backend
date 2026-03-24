-- 002_wallet_locking_updates.sql

-- =========================
-- 1. CREATE INDEX SAFELY
-- =========================
SET @index_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
    AND table_name = 'wallet_transactions'
    AND index_name = 'idx_tx_reference'
);

SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_tx_reference ON wallet_transactions(source_type, source_id)',
    'SELECT "Index exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =========================
-- 2. ADD lock_id COLUMN SAFELY
-- =========================
SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    AND table_name = 'wallet_transactions'
    AND column_name = 'lock_id'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE wallet_transactions ADD COLUMN lock_id BIGINT NULL',
    'SELECT "Column lock_id exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =========================
-- 3. ADD FOREIGN KEY SAFELY
-- =========================
SET @fk_exists = (
    SELECT COUNT(1)
    FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
    AND table_name = 'wallet_transactions'
    AND constraint_name = 'fk_tx_lock'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE wallet_transactions
     ADD CONSTRAINT fk_tx_lock
     FOREIGN KEY (lock_id) REFERENCES wallet_locks(id)
     ON DELETE SET NULL',
    'SELECT "FK exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =========================
-- 4. ADD locked_before COLUMN
-- =========================
SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    AND table_name = 'wallet_transactions'
    AND column_name = 'locked_before'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE wallet_transactions ADD COLUMN locked_before DECIMAL(18,2) DEFAULT NULL',
    'SELECT "locked_before exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =========================
-- 5. ADD locked_after COLUMN
-- =========================
SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
    AND table_name = 'wallet_transactions'
    AND column_name = 'locked_after'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE wallet_transactions ADD COLUMN locked_after DECIMAL(18,2) DEFAULT NULL',
    'SELECT "locked_after exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- =========================
-- 6. MODIFY ENUM (ALWAYS RUN)
-- =========================
ALTER TABLE wallet_transactions 
MODIFY type ENUM(
  'credit',
  'debit',
  'lock',
  'unlock',
  'consume_locked'
) NOT NULL;