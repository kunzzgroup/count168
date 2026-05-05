CREATE TABLE user_backup(
    id                      int(11)
    login_id                varchar(50)
    name                    varchar(100)	utf8mb4_unicode_ci
    password                varchar(255)	utf8mb4_unicode_ci
    secondary_password      varchar(255)	utf8mb4_unicode_ci
    email                   varchar(100)	utf8mb4_unicode_ci
    role                    enum('admin', 'manager', 'supervisor', 'accountant...),
    permissions             longtext	utf8mb4_bin
    status                  enum('active', 'inactive')	utf8mb4_unicode_ci
    created_by              varchar(50)	utf8mb4_unicode_ci
    created_at              datetime, DEFAULT CURRENT_TIMESTAMP
    last_login              datetime,
    remember_token          varchar(64),
    remember_token_expires  datetime,
    read_only               tinyint(1), DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_user_backup_login_id (login_id),
    KEY idx_user_backup_name (name),
    KEY idx_user_backup_email (email),
    KEY idx_user_backup_role (role),
    KEY idx_user_backup_status (status),
    KEY idx_user_backup_created_by (created_by),
    KEY idx_user_backup_created_at (created_at),
    KEY idx_user_backup_last_login (last_login),
    KEY idx_user_backup_remember_token (remember_token),
    KEY idx_user_backup_remember_token_expires (remember_token_expires),
    KEY idx_user_backup_read_only (read_only)
)

