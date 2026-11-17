// Fails fast (npm start / npm run dist / CI) when config.js is missing or still has placeholder values.
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = path.join(__dirname, '..', 'config.js');
const die = m => { console.error(`\n[config] ${m}\n        Copy config.example.js to config.js and fill it in (in CI: set the DROPLY_* secrets).\n`); process.exit(1); };
if (!fs.existsSync(file)) die('config.js is missing.');
const win = {};
try { vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win }); } catch (e) { die('config.js has an error: ' + e.message); }
const c = win.CONFIG;
if (!c || typeof c !== 'object') die('config.js must set window.CONFIG.');
if (typeof c.SERVER_URL !== 'string' || !/^wss?:\/\/.+/.test(c.SERVER_URL)) die('CONFIG.SERVER_URL must be a ws:// or wss:// URL.');
if (typeof c.KEY !== 'string' || !c.KEY) die('CONFIG.KEY must be a non-empty string.');
if (!Array.isArray(c.ICE)) die('CONFIG.ICE must be an array of ICE servers.');
if (/your-signaling-server|example\.com/.test(c.SERVER_URL) || c.KEY === 'change-me') die('config.js still contains the placeholder values.');
console.log('[config] OK');
