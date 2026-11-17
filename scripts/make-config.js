const fs = require('fs'), path = require('path');
const { DROPLY_SERVER_URL: url, DROPLY_ICE_JSON: ice } = process.env;
if (!url) { console.error('[config] Set DROPLY_SERVER_URL. No shared client key is used.'); process.exit(1); }
let servers = [{ urls: 'stun:stun.l.google.com:19302' }];
if (ice) { try { servers = JSON.parse(ice); } catch { console.error('[config] Invalid ICE JSON'); process.exit(1); } }
fs.writeFileSync(path.join(__dirname, '..', 'config.js'), `window.CONFIG = ${JSON.stringify({ SERVER_URL: url, ICE: servers }, null, 2)};\n`);
