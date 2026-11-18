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
