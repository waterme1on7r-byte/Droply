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
 socket.send(JSON.stringify({t:'hello',id:'spoofed-id',name:'Alice'}));await new Promise(r=>setTimeout(r,10));assert.equal(server.users.get(id).name,'Alice');assert.equal(server.users.has('spoofed-id'),false);
 const legacy=new WS(wsurl+'/?key=legacy-test');const legacyStatus=await new Promise(resolve=>{legacy.once('unexpected-response',(_req,res)=>resolve(res.statusCode));legacy.once('error',()=>resolve(401));});assert.equal(legacyStatus,401);
 const invalid=new WS(wsurl+'/device');await once(invalid,'open');const bad=once(invalid,'close');invalid.send(JSON.stringify({t:'auth',token:'invalid'}));assert.equal((await bad)[0],4401);
 const denialFrame=once(socket,'message'),revoked=once(socket,'close');await post('/admin/revoke',{code},true);assert.equal(JSON.parse((await denialFrame)[0]).t,'access-denied');assert.equal((await revoked)[0],4401);
});
test('legacy websocket access stays closed even when old compatibility variables are set',async t=>{
 const server=createServer({env:{KEY:'old-key',ALLOW_LEGACY:'true'}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const socket=new WS('ws://127.0.0.1:'+server.server.address().port+'/?key=old-key');
 const status=await new Promise(resolve=>{socket.once('unexpected-response',(_req,res)=>resolve(res.statusCode));socket.once('error',()=>resolve(401));});assert.equal(status,401);
});

test('online profiles and signaling are scoped to mutual friends; code lookup reveals only a target ID',async t=>{
 const file=fixture(),server=createServer({env:{AUTH_STORE_FILE:file}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.server.address().port,wsbase=base.replace('http','ws');
 const connect=async name=>{
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
  assert.equal((await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,token})})).status,200);
  const socket=new WS(wsbase+'/device');await once(socket,'open');const auth=once(socket,'message');socket.send(JSON.stringify({t:'auth',token}));await auth;socket.send(JSON.stringify({t:'hello',name,av:'data:image/png;base64,AAAA'}));
  return {id,socket};
 };
 const a=await connect('Alice'),b=await connect('Bob');
 const next=(socket,predicate)=>new Promise(resolve=>{const handler=raw=>{const msg=JSON.parse(raw);if(predicate(msg)){socket.off('message',handler);resolve(msg);}};socket.on('message',handler);});
 const aEmpty=next(a.socket,m=>m.t==='peers');a.socket.send(JSON.stringify({t:'watch',friends:[],codes:[],notify:[]}));assert.equal((await aEmpty).peers.length,0);
 const aProfile=next(a.socket,m=>m.t==='peers'),bProfile=next(b.socket,m=>m.t==='peers');
 b.socket.send(JSON.stringify({t:'watch',friends:[a.id],codes:[],notify:[]}));assert.equal((await aProfile).peers.length,0);assert.equal((await bProfile).peers.length,0);
 let received=[];b.socket.on('message',raw=>received.push(JSON.parse(raw)));
 a.socket.send(JSON.stringify({t:'sig',to:b.id,data:{t:'req',tid:'blocked'}}));await new Promise(r=>setTimeout(r,20));assert(!received.some(m=>m.t==='sig'));
 const resolved=next(a.socket,m=>m.t==='resolved');a.socket.send(JSON.stringify({t:'lookup',code:codeFor(b.id)}));const result=await resolved;assert.equal(result.id,b.id);assert.equal(result.name,undefined);assert.equal(result.av,undefined);
 const aFriend=next(a.socket,m=>m.t==='peers'),bFriend=next(b.socket,m=>m.t==='peers');
 a.socket.send(JSON.stringify({t:'watch',friends:[b.id],codes:[],notify:[]}));await aFriend;
 b.socket.send(JSON.stringify({t:'watch',friends:[a.id],codes:[],notify:[]}));
 assert.equal((await next(a.socket,m=>m.t==='peers')).peers[0].name,'Bob');assert.equal((await bFriend).peers[0].name,'Alice');
 const delivered=next(b.socket,m=>m.t==='sig'&&m.from===a.id);a.socket.send(JSON.stringify({t:'sig',to:b.id,data:{t:'req',tid:'friend-only'}}));assert.equal((await delivered).data.t,'req');
 for(const c of [a.socket,b.socket])c.terminate();
});

test('oversized friend roster omits avatars instead of exceeding the WebSocket frame limit',async t=>{
 const file=fixture(),server=createServer({env:{AUTH_STORE_FILE:file}});await new Promise(r=>server.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.server.address().port,wsBase=base.replace('http','ws');
 const sockets=Array.from({length:20},()=>new WS(wsBase+'/device'));
 t.after(async()=>{for(const socket of sockets)socket.terminate();await server.close();});
 await Promise.all(sockets.map(socket=>once(socket,'open')));
 const avatar='data:image/jpeg;base64,'+'A'.repeat(59900),ids=[];let latest;
 for(let i=0;i<sockets.length;i++){
  ids.push(crypto.randomUUID());
  const token=crypto.randomBytes(32).toString('base64url');
  assert.deepEqual(await server.store.register(ids[i],token),{id:ids[i]});
  const authed=once(sockets[i],'message');sockets[i].send(JSON.stringify({t:'auth',token}));await authed;
  sockets[i].send(JSON.stringify({t:'hello',name:'Device '+i,av:avatar}));
 }
 for(let i=0;i<sockets.length;i++){
  const next=once(sockets[0],'message');
  sockets[i].send(JSON.stringify({t:'watch',friends:ids.filter(id=>id!==ids[i]),codes:[],notify:[]}));
  const [raw]=await next;latest=JSON.parse(raw);assert(Buffer.byteLength(raw)<1<<20);
 }
 assert.equal(latest.peers.length,sockets.length-1);
 assert(latest.peers.every(peer=>!Object.hasOwn(peer,'av')));
 assert(sockets.every(socket=>socket.readyState===WS.OPEN));
});
