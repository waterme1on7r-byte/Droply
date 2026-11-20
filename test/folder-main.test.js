const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'),path=require('path');
const { loadMain, tick } = require('./helpers');
test('accepted folder transfer saves nested files and durable history through main IPC', async()=>{
 const {h,ev,ready,dl}=loadMain();await ready();
 assert.equal(await h.handle['prepare-receive'](ev,'nested',[{ name:'Photos/Trip/a.txt',size:14 }]),true);
 h.on['save-open'](ev,'nested','Photos/Trip/a.txt',14);h.on['save-chunk'](ev,'nested',Buffer.from('folder payload'));h.on['save-close'](ev,'nested');
 await tick(50);
 const saved=h.sent.find(([ch,d])=>ch==='saved'&&d.tid==='nested');assert(saved);
 assert.equal(fs.readFileSync(saved[1].path,'utf8'),'folder payload');
 assert(saved[1].path.startsWith(path.join(dl,'DROPLY transfer','Photos','Trip')));
 const history=await h.handle['get-history'](ev);assert.equal(history[0].path,saved[1].path);
 await h.handle['finish-receive'](ev,'nested');
});

test('browser-sent PNG data saves byte-for-byte on native Windows receive path', async()=>{
 // Use a real valid 1x1 PNG and a plain Uint8Array, as an Electron renderer
 // sends over IPC (not a Node Buffer). The file format must remain untouched.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 const {h,ev,ready}=loadMain();await ready();
 assert.equal(await h.handle['prepare-receive'](ev,'web-png',[{name:'Photo from Safari.png',size:png.length}]),true);
 h.on['save-open'](ev,'web-png','Photo from Safari.png',png.length);
 const browserBytes=new Uint8Array(png);
 h.on['save-chunk'](ev,'web-png',browserBytes);
 h.on['save-close'](ev,'web-png');
 await tick(80);
 const failure=h.sent.find(([ch,d])=>ch==='save-error'&&d.tid==='web-png');
 assert.equal(failure,undefined,'The native save path must not reject valid PNG bytes');
 const saved=h.sent.find(([ch,d])=>ch==='saved'&&d.tid==='web-png');
 assert.ok(saved,'Native receiver must persist and acknowledge the completed image');
 assert.equal(path.extname(saved[1].path),'.png');
 assert.deepEqual(fs.readFileSync(saved[1].path),png,'Bytes must be identical to browser original');
});

test('Windows-hostile characters in a browser image filename are sanitized safely', async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 const {h,ev,ready}=loadMain();await ready();
 const original='Photo: From Safari?.png';
 assert.equal(await h.handle['prepare-receive'](ev,'web-name',[{name:original,size:png.length}]),true);
 h.on['save-open'](ev,'web-name',original,png.length);
 h.on['save-chunk'](ev,'web-name',new Uint8Array(png));
 h.on['save-close'](ev,'web-name');
 await tick(80);
 const saved=h.sent.find(([ch,d])=>ch==='saved'&&d.tid==='web-name');
 assert.ok(saved);
 assert.equal(path.basename(saved[1].path),'Photo_ From Safari_.png');
 assert.deepEqual(fs.readFileSync(saved[1].path),png);
});
