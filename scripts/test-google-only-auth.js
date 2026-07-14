const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('backend/server.js', 'utf8');
const frontend = fs.readFileSync('src/main.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

assert.doesNotMatch(server, /app\.post\('\/api\/auth\/email'/);
assert.doesNotMatch(server, /emailTrialAccess/);
assert.doesNotMatch(frontend, /startEmailLogin|emailInput|email-access-field|email-auth-button/);
assert.doesNotMatch(frontend, /Demo access by email|Демо-вхід з email/);
assert.doesNotMatch(styles, /\.email-access-field|\.email-auth-button/);
assert.match(frontend, /auth\/google\/start/);

console.log('google-only auth tests passed');
