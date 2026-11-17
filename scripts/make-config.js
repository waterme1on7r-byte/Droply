// CI helper: writes config.js from environment variables (GitHub secrets). Values are JSON-escaped.
const fs = require('fs'), path = require('path');
const { DROPLY_SERVER_URL: url, DROPLY_KEY: key, DROPLY_ICE_JSON: ice } = process.env;
if (!url || !key) { console.error('[config] Set the DROPLY_SERVER_URL and DROPLY_KEY secrets (DROPLY_ICE_JSON is optional).'); process.exit(1); }
let servers = [{ urls: 'stun:stun.l.google.com:19302' }];
if (ice) { try { servers = JSON.parse(ice); } catch { console.error('[config] DROPLY_ICE_JSON is not valid JSON.'); process.exit(1); } }
fs.writeFileSync(path.join(__dirname, '..', 'config.js'), `window.CONFIG = ${JSON.stringify({ SERVER_URL: url, KEY: key, ICE: servers }, null, 2)};\n`);
console.log('[config] config.js written');
