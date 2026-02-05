const fs = require('fs');
const path = require('path');
const phpPath = path.join(__dirname, 'payment_maintenance.php');
const jsPath = path.join(__dirname, 'js', 'payment_maintenance.js');
const lines = fs.readFileSync(phpPath, 'utf8').split(/\r?\n/);
const body = lines.slice(139, 767).join('\n');
const out = body.replace(
    /        let currentCompanyId = __PHP_SESSION_COMPANY_ID_PLACEHOLDER__;/,
    "        let currentCompanyId = typeof window.currentCompanyId !== 'undefined' ? window.currentCompanyId : null;"
);
fs.writeFileSync(jsPath, out, 'utf8');
console.log('Written js/payment_maintenance.js');
