const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createDesktop } = require('../desktop');
function fixture(raw) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'droply-settings-')), handlers={}, copied=[], events=[];
 if(raw) fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(raw));
 const deps={ app:{ getPath:()=>dir,getVersion:()=> '2.6.0',isPackaged:false }, ipcMain:{handle:(n,f)=>handlers[n]=f},dialog:{},shell:{},clipboard:{writeText:s=>copied.push(s)},fromUI:e=>e===true,toUI:(...e)=>events.push(e),window:()=>null,safeName:n=>n.replace(/[<>:"/\\|?*]/g,'_'),log:()=>{} };
 const desktop=createDesktop(deps); const call=(n,...a)=>handlers[n](true,...a);
 return {desktop,call,handlers,dir,deps,copied,events};
}
test('preferences persist, validate themes, and ignore renderer-supplied download paths',async()=>{
 const f=fixture();await f.call('save-settings',{theme:'light',askSave:true,downloadDir:'C:/untrusted'});
 assert.equal(f.desktop.settings.theme,'light'); assert.equal(f.desktop.settings.downloadDir,f.dir);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'settings.json'))).askSave,true);
 await assert.rejects(f.call('save-settings',{theme:'anything'}));
 assert.equal(await f.handlers['save-settings'](false,{theme:'dark'}),null);
});
test('download destination dialog cancel refuses transfer',async()=>{
 const f=fixture({askSave:true}); f.deps.dialog.showOpenDialog=async()=>({canceled:true});
 assert.equal(await f.call('prepare-receive','a',['file']),false);
});
test('folder paths preserve nesting in exclusive transfer roots and reject traversal',async()=>{
 const f=fixture(); assert.equal(await f.call('prepare-receive','a',['Photos/Trip/a.jpg']),true);
 const dest=f.desktop.target('a','Photos/Trip/a.jpg'); assert.equal(dest.name,'a.jpg');assert(dest.dir.startsWith(path.join(f.dir,'DROPLY transfer')));
 assert(fs.statSync(dest.dir).isDirectory());
 await f.call('prepare-receive','b',['Photos/Trip/a.jpg']); assert.notEqual(f.desktop.target('b','Photos/Trip/a.jpg').dir,dest.dir);
 await assert.rejects(f.call('prepare-receive','bad',['../outside.txt']));
 await assert.rejects(f.call('prepare-receive','bad',['root/../../outside.txt']));
});
test('history paths are only recorded by main process and capped',async()=>{
 const f=fixture(); await f.call('record-transfer',{name:'example',direction:'out',state:'done',path:'C:/untrusted'});
 const list=await f.call('get-history'); assert.equal(list[0].path,undefined);
 for(let i=0;i<301;i++) f.desktop.record({name:String(i),direction:'in',state:'done'});
 assert.equal((await f.call('get-history')).length,300);
 await f.call('clear-history'); assert.deepEqual(await f.call('get-history'),[]);
});
test('diagnostics excludes identity and credentials; dev startup is rejected',async()=>{
 const f=fixture(); await f.call('copy-diagnostics');assert.match(f.copied[0],/DROPLY 2.6.0/);assert(!f.copied[0].includes('DRP-'));
 await assert.rejects(f.call('save-settings',{launchAtStartup:true}));
});
