const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createAccess,validateServer}=require('../access');
function fixture({secure=true,responseId,server='wss://example.test'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'droply-access-')),handles={},listeners={},events=[],calls=[],sockets=[];
 const profile={id:'12345678-1234-1234-1234-123456789012',name:'Tester',avatar:''},token='T'.repeat(43);
 class Socket extends EventEmitter{constructor(url){super();this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);}send(m){this.sent.push(JSON.parse(m));}terminate(){this.emit('close',1006);}close(){this.emit('close',1000);}}
 const access=createAccess({app:{getPath:()=>root,on:()=>{}},ipcMain:{handle:(ch,f)=>handles[ch]=f,on:(ch,f)=>listeners[ch]=f},safeStorage:{isEncryptionAvailable:()=>secure,encryptString:s=>Buffer.from('protected:'+s.split('').reverse().join('')),decryptString:b=>b.toString().slice(10).split('').reverse().join('')},fromUI:e=>e===true,toUI:(ch,data)=>events.push(data),getProfile:()=>profile,serverURL:server,Socket,
 fetcher:async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>({id:responseId||profile.id,token})};}});
 return {root,handles,listeners,events,calls,sockets,profile,token,access,call:(ch,...args)=>handles[ch](true,...args)};
}
test('server URLs require TLS and never accept embedded credentials or query keys',()=>{
 for(const url of ['ws://example.test','wss://user:pass@example.test','wss://example.test/?key=secret'])assert.throws(()=>validateServer(url));
 assert.equal(validateServer('ws://127.0.0.1:9000').hostname,'127.0.0.1');
});
test('enrollment is bound to profile; token is encrypted and excluded from renderer API',async()=>{
 const f=fixture();await f.call('enroll-device','I'.repeat(43));f.access.stop();
 const disk=fs.readFileSync(path.join(f.root,'device-access.json'),'utf8');assert(!disk.includes(f.token));assert.equal(JSON.parse(disk).id,f.profile.id);
 const status=await f.call('get-access');assert(!JSON.stringify(status).includes(f.token));
 const sent=JSON.parse(f.calls[0].options.body);assert.equal(sent.id,f.profile.id);assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.sockets[0].url,'wss://example.test/device');
 assert.equal(await f.handles['get-access'](false),null);
});
test('enrollment refuses unavailable OS encryption and invalid response identity',async()=>{
 const f=fixture({secure:false});await assert.rejects(f.call('enroll-device','I'.repeat(43)),/storage/);assert.equal(f.calls.length,0);
 const bad=fixture({responseId:'different-device'});await assert.rejects(bad.call('enroll-device','I'.repeat(43)),/Invalid server/);assert(!fs.existsSync(path.join(bad.root,'device-access.json')));
});
test('only authenticated socket exposes signaling, and main process fixes hello identity',async()=>{
 const f=fixture();await f.call('enroll-device','I'.repeat(43));const socket=f.sockets[0];
 f.listeners['send-signal'](true,{t:'hello',id:'spoofed'});assert.equal(socket.sent.length,0);
 socket.emit('open');assert.equal(socket.sent[0].t,'auth');
 socket.emit('message',JSON.stringify({t:'authenticated',id:f.profile.id}));assert.equal(socket.sent[1].id,f.profile.id);
 f.listeners['send-signal'](true,{t:'hello',id:'spoofed',name:'spoofed'});assert.equal(socket.sent.at(-1).id,f.profile.id);assert.equal(socket.sent.at(-1).name,f.profile.name);
 f.listeners['send-signal'](true,{t:'watch',friends:[f.profile.id],codes:[],notify:[]});assert.equal(socket.sent.at(-1).t,'watch');
 f.listeners['send-signal'](true,{t:'lookup',code:'DRP-1234-5678-9ABC'});assert.equal(socket.sent.at(-1).t,'lookup');
 const n=socket.sent.length;f.listeners['send-signal'](false,{t:'sig',to:'victim',data:{}});assert.equal(socket.sent.length,n);
 socket.emit('message',JSON.stringify({t:'resolved',id:'12345678-1234-1234-1234-123456789012'}));assert.equal(f.events.at(-1).message.t,'resolved');
 socket.emit('close',4401);assert.equal(f.events.at(-1).state,'enrollment-required');f.access.stop();
});

test('explicit access denial stops reconnects even if a proxy changes the close code',async()=>{
 const f=fixture();await f.call('enroll-device','I'.repeat(43));const socket=f.sockets[0];socket.emit('open');socket.emit('message',JSON.stringify({t:'authenticated',id:f.profile.id}));
 socket.emit('message',JSON.stringify({t:'access-denied',message:'Revoked'}));
 assert.equal(f.events.at(-1).state,'enrollment-required');assert(!f.events.some(e=>e.state==='offline'));f.access.stop();
});
test('first launch registers automatically and keeps the same device identity',async()=>{
 const f=fixture();await f.access.connect();assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/auth\/register$/);
 const data=JSON.parse(f.calls[0].options.body);assert.equal(data.id,f.profile.id);assert.equal(data.invitation,undefined);assert.equal(data.token.length,43);
 const saved=JSON.parse(fs.readFileSync(path.join(f.root,'device-access.json'),'utf8'));assert.equal(saved.registered,true);assert(!JSON.stringify(saved).includes(data.token));f.access.stop();
 await f.access.connect();assert.equal(f.calls.length,1);f.access.stop();
});
