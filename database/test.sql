CREATE TABLE user_company_map_backup(
    id                int(11) NOT NULL AUTO_INCREMENT,
    user_id           int(11) NOT NULL,
    user_name         varchar(255) DEFAULT NULL,
    company_id        int(11) NOT NULL,
    company_name      varchar(255) DEFAULT NULL,

    PRIMARY KEY (id),
    KEY idx_user_backup_user_id (user_id),
    KEY idx_user_backup_user_name (user_name),
    KEY idx_user_backup_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

