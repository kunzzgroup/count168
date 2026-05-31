-- 维护跑马灯：可选前缀类型（系统维护中 / 温馨提示）
ALTER TABLE maintenance_marquee
    ADD COLUMN label_type ENUM('maintenance', 'reminder') NOT NULL DEFAULT 'maintenance'
    AFTER content;
