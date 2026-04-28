-- Allow ADJUSTMENT to carry a signed amount while keeping other transaction types positive.
-- This replaces the legacy transactions validation triggers that reject every amount <= 0.

DROP TRIGGER IF EXISTS before_transaction_insert;
DROP TRIGGER IF EXISTS before_transaction_update;

DELIMITER //

CREATE TRIGGER before_transaction_insert
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT amount cannot be 0';
        END IF;

        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '金额必须大于 0';
        END IF;
    END IF;

    IF NEW.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'CLEAR') THEN
        IF NEW.from_account_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR 交易必须有 From Account';
        END IF;

        IF NEW.from_account_id = NEW.account_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'From Account 和 To Account 不能相同';
        END IF;
    END IF;
END//

CREATE TRIGGER before_transaction_update
BEFORE UPDATE ON transactions
FOR EACH ROW
BEGIN
    IF NEW.transaction_type = 'ADJUSTMENT' THEN
        IF NEW.amount = 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT amount cannot be 0';
        END IF;

        IF NEW.from_account_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ADJUSTMENT only supports one account';
        END IF;
    ELSE
        IF NEW.amount <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '金额必须大于 0';
        END IF;
    END IF;

    IF NEW.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'CLEAR') THEN
        IF NEW.from_account_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'PAYMENT/RECEIVE/CONTRA/CLAIM/CLEAR 交易必须有 From Account';
        END IF;

        IF NEW.from_account_id = NEW.account_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'From Account 和 To Account 不能相同';
        END IF;
    END IF;
END//

DELIMITER ;
