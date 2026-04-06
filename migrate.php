<?php
\System.Management.Automation.Internal.Host.InternalHost = '127.0.0.1';
\ = 'u857194726_count168';
\ = 'u857194726_count168';
\ = 'Kholdings1688@';
try {
    \ = new PDO("mysql:host=\System.Management.Automation.Internal.Host.InternalHost;dbname=\;charset=utf8mb4", \, \);
    \->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    \->exec("ALTER TABLE company_ownership ADD COLUMN include_group TINYINT(1) DEFAULT 1");
    echo "Success";
} catch (Exception \) {
    echo \->getMessage();
}
