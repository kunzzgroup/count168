-- 删除并重建 user_backup，结构与 user 完全一致（列、索引、引擎、字符集）。
-- 前提：数据库中已存在 `user` 表。
-- 执行：mysql -u <user> -p <database> < database/create_user_backup.sql
--
-- 建表后再同步数据：php cron/sync_user_backup.php

DROP TABLE IF EXISTS user_backup;

CREATE TABLE user_backup LIKE `user`;
