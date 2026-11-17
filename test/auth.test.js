const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events'),WS=require('ws');
const {createServer}=require('../server'),{createStore,codeFor}=require('../auth-store');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'droply-auth-'));return path.join(dir,'auth.json');}
test('invitation is bound, expires, is single use, and survives storage restart',()=>{
 let now=1000;const file=fixture(),store=createStore(file,()=>now),id=crypto.randomUUID(),inv=store.invite(codeFor(id),60000);
 assert.equal(store.enroll(inv.invitation,crypto.randomUUID()),null);
 const enrolled=store.enroll(inv.invitation,id);assert.equal(enrolled.id,id);assert.equal(store.enroll(inv.invitation,id),null);
 const restarted=createStore(file,()=>now);assert.equal(restarted.authenticate(enrolled.token),id);
 const data=fs.readFileSync(file,'utf8');assert(!data.includes(enrolled.token));assert(!data.includes(inv.invitation));
 const expId=crypto.randomUUID(),exp=restarted.invite(codeFor(expId),60000);now+=60001;assert.equal(restarted.enroll(exp.invitation,expId),null);
 assert.equal(restarted.revoke(codeFor(id))[0],id);assert.equal(restarted.authenticate(enrolled.token),null);
});
test('corrupt store fails closed rather than replacing identities',()=>{const file=fixture();fs.writeFileSync(file,'broken');assert.throws(()=>createStore(file));assert.equal(fs.readFileSync(file,'utf8'),'broken');});
test('admin authorization, enrollment, socket identity, legacy protection and revocation',async t=>{
 const file=fixture(),admin='a'.repeat(48),server=createServer({env:{AUTH_STORE_FILE:file,ADMIN_TOKEN:admin,KEY:'legacy-test'}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.server.address().port,wsurl=url.replace('http','ws');
 const post=(route,data,authorized=false)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+admin}:{})},body:JSON.stringify(data)});
 assert.equal((await post('/admin/invites',{})).status,401);
 const id=crypto.randomUUID(),code=codeFor(id),i=await(await post('/admin/invites',{code},true)).json();
 assert.equal((await post('/auth/enroll',{id:crypto.randomUUID(),invitation:i.invitation})).status,403);
 const e=await(await post('/auth/enroll',{id,invitation:i.invitation})).json();assert.equal(e.id,id);
 assert.equal((await post('/auth/enroll',{id,invitation:i.invitation})).status,403);
 const socket=new WS(wsurl+'/device');await once(socket,'open');const authed=once(socket,'message');socket.send(JSON.stringify({t:'auth',token:e.token}));assert.equal(JSON.parse((await authed)[0]).id,id);
 const peers=once(socket,'message');socket.send(JSON.stringify({t:'hello',id:'spoofed-id',name:'Alice'}));assert.equal(JSON.parse((await peers)[0]).peers[0].id,id);
 const legacy=new WS(wsurl+'/?key=legacy-test');await once(legacy,'open');const denied=once(legacy,'close');legacy.send(JSON.stringify({t:'hello',id,name:'Impersonator'}));assert.equal((await denied)[0],4401);
 const invalid=new WS(wsurl+'/device');await once(invalid,'open');const bad=once(invalid,'close');invalid.send(JSON.stringify({t:'auth',token:'invalid'}));assert.equal((await bad)[0],4401);
 const revoked=once(socket,'close');await post('/admin/revoke',{code},true);assert.equal((await revoked)[0],4401);
});
test('migration remains compatible without storage; secure enrollment does not silently use legacy',async t=>{
 const server=createServer({env:{KEY:'legacy-test'}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.server.address().port;
 assert.equal((await(await fetch(base+'/auth/status')).json()).enrollment,false);
 const sock=new WS(base.replace('http','ws')+'/?key=legacy-test');await once(sock,'open');const peers=once(sock,'message');sock.send(JSON.stringify({t:'hello',id:'old-installation',name:'Old app'}));assert.equal(JSON.parse((await peers)[0]).peers[0].id,'old-installation');sock.close();
});

test('explicit migration flag preserves an existing unkeyed service; default remains closed',async t=>{
 const server=createServer({env:{ALLOW_LEGACY:'true'}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const socket=new WS('ws://127.0.0.1:'+server.server.address().port+'/?key=old-client-value');await once(socket,'open');const peers=once(socket,'message');socket.send(JSON.stringify({t:'hello',id:'old-device',name:'Old'}));assert.equal(JSON.parse((await peers)[0]).peers[0].id,'old-device');socket.close();
 const closed=createServer({env:{}});assert.equal(closed.allowLegacy,false);await closed.close();
});
