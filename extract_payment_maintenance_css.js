const fs = require('fs');
const path = require('path');
const phpPath = path.join(__dirname, 'payment_maintenance.php');
const cssPath = path.join(__dirname, 'css', 'payment_maintenance.css');
const lines = fs.readFileSync(phpPath, 'utf8').split(/\r?\n/);
const inner = lines.slice(770, 1509).map(l => l.startsWith('        ') ? l.slice(8) : l).join('\n');
fs.writeFileSync(cssPath, '/* payment_maintenance.php - 提取的页面样式 */\n' + inner, 'utf8');
console.log('Written css/payment_maintenance.css');
