'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const {createStore}=require('./auth-store');
function createServer(options={}){
 const env=options.env||process.env,legacyKey=env.KEY||'',allowLegacy=!!legacyKey&&env.ALLOW_LEGACY!=='false';
 const store=env.DATABASE_URL?require('./postgres-store').createPostgresStore(env.DATABASE_URL):env.AUTH_STORE_FILE?createStore(env.AUTH_STORE_FILE):null,admin=env.ADMIN_TOKEN||'';
 const users=new Map(),buckets=new Map(),ipConnections=new Map();
 const limit=(key,max,ms)=>{const time=Date.now();let b=buckets.get(key);if(!b||b.until<time){if(buckets.size>=10000)return false;b={count:0,until:time+ms};buckets.set(key,b);}return ++b.count<=max;};
 const equal=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
 const send=(ws,m)=>{if(ws.readyState===1){if(ws.bufferedAmount>4*1024*1024)return ws.terminate();ws.send(JSON.stringify(m));}};
 const broadcast=()=>{const peers=[...users.values()].map(u=>({id:u.id,name:u.name,av:u.av}));for(const u of users.values())send(u.ws,{t:'peers',peers});};
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 async function body(req){let data='';for await(const part of req){data+=part;if(Buffer.byteLength(data)>4096)throw Error('Body too large');}return JSON.parse(data||'{}');}
 const srv=http.createServer(async(req,res)=>{
  const route=req.url.split('?')[0],ip=req.socket.remoteAddress;
  try{
   if(req.method==='GET'&&route==='/')return json(res,200,{service:'DROPLY signaling',protocol:2});
   if(store?.ready)await store.ready;
   if(req.method==='GET'&&route==='/auth/status')return json(res,200,{protocol:2,enrollment:!!store&&admin.length>=32});
   if(route.startsWith('/admin/')){
    if(!limit('admin:'+ip,30,60000))return json(res,429,{error:'Try again later'});
    if(admin.length<32||!equal(req.headers.authorization||'','Bearer '+admin))return json(res,401,{error:'Unauthorized'});
    if(!store)return json(res,503,{error:'Persistent auth storage is not configured'});
    if(req.method==='GET'&&route==='/admin/devices')return json(res,200,{devices:await store.devices()});
    if(req.method==='POST'&&route==='/admin/invites'){const d=await body(req);return json(res,201,await store.invite(d.code,d.ttlMs||900000,d.replace));}
    if(req.method==='POST'&&route==='/admin/revoke'){const d=await body(req),ids=await store.revoke(d.code);for(const id of ids)users.get(id)?.ws.close(4401,'Device access revoked');return json(res,200,{revoked:ids.length});}
    return json(res,404,{error:'Not found'});
   }
   if(req.method==='POST'&&route==='/auth/enroll'){
    if(!limit('enroll:'+ip,10,60000))return json(res,429,{error:'Too many attempts. Try again later.'});
    if(!store||admin.length<32)return json(res,503,{error:'Ask the administrator to configure secure enrollment.'});
    const d=await body(req),result=await store.enroll(d.invitation,d.id);
    if(!result)return json(res,403,{error:'Invitation is invalid, expired, already used, or belongs to another device.'});
    users.get(result.id)?.ws.close(4401,'Credential replaced');return json(res,201,result);
   }
   json(res,404,{error:'Not found'});
  }catch{if(!res.headersSent)json(res,400,{error:'Request could not be completed'});else res.end();}
 });
 srv.requestTimeout=15000;srv.headersTimeout=10000;
 const wss=new WebSocketServer({noServer:true,maxPayload:1<<20,perMessageDeflate:false});
 srv.on('upgrade',(req,socket,head)=>{
  const ip=req.socket.remoteAddress;
  if(!limit('upgrade:'+ip,60,60000)||(ipConnections.get(ip)||0)>=20||wss.clients.size>=1000){socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');return;}
  let url;try{url=new URL(req.url,'http://localhost');}catch{return socket.destroy();}
  let mode;if(store&&url.pathname==='/device'&&!url.search)mode='device';
  else if(allowLegacy&&url.pathname==='/'&&equal(url.searchParams.get('key')||'',legacyKey))mode='legacy';
  if(!mode){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,{ip,mode}));
 });
 wss.on('connection',(ws,{ip,mode})=>{
  ipConnections.set(ip,(ipConnections.get(ip)||0)+1);let identity=null,me=null,count=0,window=Date.now();ws.alive=true;
  const timeout=setTimeout(()=>ws.close(4401,'Authentication timed out'),10000);timeout.unref();
  ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
  ws.on('message',raw=>{ ws.queue=(ws.queue||Promise.resolve()).then(async()=>{
   if(Date.now()-window>=1000){window=Date.now();count=0;}if(++count>100)return ws.close(4429,'Too many messages');
   if(ws.readyState!==1)return;
   let m;try{m=JSON.parse(raw);}catch{return ws.close(4400,'Invalid message');}if(!m||typeof m!=='object')return;
   if(mode==='device'&&!identity){if(m.t!=='auth'||!(identity=await store.authenticate(m.token)))return ws.close(4401,'Device credential invalid or revoked');clearTimeout(timeout);send(ws,{t:'authenticated',id:identity});return;}
   if(m.t==='hello'){
    const id=mode==='device'?identity:m.id;
    if(typeof id!=='string'||!id||id.length>64||typeof m.name!=='string'||!m.name.trim())return;
    if(mode==='device'&&!await store.active(id))return ws.close(4401,'Device access revoked');
    if(mode==='legacy'&&store&&await store.registered(id))return ws.close(4401,'Use the enrolled app for this device');
    if(me&&me.id!==id)return ws.close(4400,'Identity cannot change');
    clearTimeout(timeout);const av=typeof m.av==='string'&&m.av.length<60000&&/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(m.av)?m.av:'';
    if(ws.readyState!==1)return;
    const old=users.get(id);me={id,name:Array.from(m.name.trim()).slice(0,24).join(''),av,ws};users.set(id,me);if(old&&old.ws!==ws)old.ws.close(4000,'Connected on another session');broadcast();
   }else if(m.t==='sig'&&me&&typeof m.to==='string'&&m.data&&typeof m.data==='object'){
    const to=users.get(m.to);if(to)send(to.ws,{t:'sig',from:me.id,data:m.data});
   }
  }).catch(()=>ws.close(1011,'Authentication service unavailable')); });
  ws.on('close',()=>{clearTimeout(timeout);ipConnections.set(ip,Math.max(0,(ipConnections.get(ip)||1)-1));if(ipConnections.get(ip)===0)ipConnections.delete(ip);if(me&&users.get(me.id)?.ws===ws){users.delete(me.id);broadcast();}});
 });
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const[k,b]of buckets)if(b.until<Date.now())buckets.delete(k);},25000);heartbeat.unref();
 return {server:srv,store,users,allowLegacy,close:async()=>{clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));if(srv.listening)await new Promise(resolve=>srv.close(resolve));await store?.close?.();}};
}
module.exports={createServer};
if(require.main===module){(async()=>{try{const instance=createServer();if(instance.store?.ready)await instance.store.ready;instance.server.listen(process.env.PORT||8080,()=>console.log('DROPLY signaling ready; enrollment storage: '+!!instance.store+'; legacy compatibility: '+instance.allowLegacy));const stop=()=>instance.close().then(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);}catch{console.error('Cannot open authentication storage. Restore storage or correct configuration; identities were not reset.');process.exit(1);}})();}
