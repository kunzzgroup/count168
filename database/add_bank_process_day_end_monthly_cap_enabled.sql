-- Add day_end_monthly_cap_enabled to bank_process for the Edit Process Day-end cap toggle
-- (1st of Every Month + extended day_end tail → Accounting Due). Run once; skip if column already exists.
ALTER TABLE bank_process
  ADD COLUMN day_end_monthly_cap_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER day_end;
