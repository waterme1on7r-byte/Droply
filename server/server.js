'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const {createStore,codeFor}=require('./auth-store');
function createServer(options={}){
 const env=options.env||process.env;
 const store=env.DATABASE_URL?require('./postgres-store').createPostgresStore(env.DATABASE_URL):env.AUTH_STORE_FILE?createStore(env.AUTH_STORE_FILE):null,admin=env.ADMIN_TOKEN||'';
 const origins=(env.WEB_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 for(const origin of origins){const u=new URL(origin);if(u.origin!==origin||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('Invalid WEB_ALLOWED_ORIGINS');}
 const allowedOrigins=new Set(origins);
 const sessions=new Map(),users=new Map(),buckets=new Map(),ipConnections=new Map();
 const limit=(key,max,ms)=>{const time=Date.now();let b=buckets.get(key);if(!b||b.until<time){if(buckets.size>=10000)return false;b={count:0,until:time+ms};buckets.set(key,b);}return ++b.count<=max;};
 const equal=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);};
 const send=(ws,m)=>{if(ws.readyState===1){if(ws.bufferedAmount>4*1024*1024)return ws.terminate();ws.send(typeof m==='string'?m:JSON.stringify(m));}};
 const deny=(ws,message)=>{send(ws,{t:'access-denied',message});ws.close(4401,message);};
 const disconnect=id=>{for(const ws of sessions.get(id)||[])deny(ws,'Device access revoked or replaced');};
 const broadcast=()=>{const online=[...users.values()],byCode=new Map(online.map(u=>[codeFor(u.id),u]));for(const recipient of online){let peers=online.filter(u=>u.id!==recipient.id&&recipient.friends.has(u.id)&&u.friends.has(recipient.id)).map(u=>({id:u.id,name:u.name,av:u.av,platform:u.platform}));let frame=JSON.stringify({t:'peers',peers});if(Buffer.byteLength(frame)>=(1<<20)-1024){peers=peers.map(({id,name,platform})=>({id,name,platform}));frame=JSON.stringify({t:'peers',peers});}send(recipient.ws,frame);for(const code of recipient.watchCodes){const target=byCode.get(code);if(target)send(recipient.ws,{t:'resolved',id:target.id,code});}for(const id of recipient.notifyIds)if(users.has(id))send(recipient.ws,{t:'resolved',id});}};
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 async function body(req){let data='';for await(const part of req){data+=part;if(Buffer.byteLength(data)>4096)throw Error('Body too large');}return JSON.parse(data||'{}');}
 const srv=http.createServer(async(req,res)=>{
  const route=req.url.split('?')[0],ip=req.socket.remoteAddress;
  try{
   // Browser API requests are allowed only from explicitly configured site origins.
   // Native clients do not send an Origin header and retain existing behavior.
   if(['/auth/status','/auth/register','/auth/enroll'].includes(route)){
    const origin=req.headers.origin;
    if(origin&&!allowedOrigins.has(origin))return json(res,403,{error:'Browser origin not allowed'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'});return res.end();}
   }
   if(req.method==='GET'&&route==='/')return json(res,200,{service:'DROPLY signaling',protocol:2});
   if(store?.ready)await store.ready;
   if(req.method==='GET'&&route==='/auth/status')return json(res,200,{protocol:2,enrollment:!!store&&admin.length>=32,automaticRegistration:!!store});
   if(req.method==='POST'&&route==='/auth/register'){
    if(!limit('register:'+ip,10,60000)||!limit('register-global',200,3600000))return json(res,429,{error:'Please try again shortly'});
    if(!store)return json(res,503,{error:'Registration is not ready'});
    const d=await body(req),result=await store.register(d.id,d.token);
    if(!result)return json(res,409,{error:'This identity is already registered or unavailable'});
    return json(res,200,result);
   }
   if(route.startsWith('/admin/')){
    if(!limit('admin:'+ip,30,60000))return json(res,429,{error:'Try again later'});
    if(admin.length<32||!equal(req.headers.authorization||'','Bearer '+admin))return json(res,401,{error:'Unauthorized'});
    if(!store)return json(res,503,{error:'Persistent auth storage is not configured'});
    if(req.method==='GET'&&route==='/admin/devices')return json(res,200,{devices:await store.devices()});
    if(req.method==='POST'&&route==='/admin/invites'){const d=await body(req);return json(res,201,await store.invite(d.code,d.ttlMs||900000,d.replace));}
    if(req.method==='POST'&&route==='/admin/revoke'){const d=await body(req),ids=await store.revoke(d.code);for(const id of ids)disconnect(id);return json(res,200,{revoked:ids.length});}
    return json(res,404,{error:'Not found'});
   }
   if(req.method==='POST'&&route==='/auth/enroll'){
    if(!limit('enroll:'+ip,10,60000))return json(res,429,{error:'Too many attempts. Try again later.'});
    if(!store||admin.length<32)return json(res,503,{error:'Ask the administrator to configure secure enrollment.'});
    const d=await body(req),result=await store.enroll(d.invitation,d.id);
    if(!result)return json(res,403,{error:'Invitation is invalid, expired, already used, or belongs to another device.'});
    disconnect(result.id);return json(res,201,result);
   }
   json(res,404,{error:'Not found'});
  }catch{if(!res.headersSent)json(res,400,{error:'Request could not be completed'});else res.end();}
 });
 srv.requestTimeout=15000;srv.headersTimeout=10000;
 const wss=new WebSocketServer({noServer:true,maxPayload:1<<20,perMessageDeflate:false});
 srv.on('upgrade',(req,socket,head)=>{
  if(req.headers.origin&&!allowedOrigins.has(req.headers.origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  const ip=req.socket.remoteAddress;
  if(!limit('upgrade:'+ip,60,60000)||(ipConnections.get(ip)||0)>=20||wss.clients.size>=1000){socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');return;}
  let url;try{url=new URL(req.url,'http://localhost');}catch{return socket.destroy();}
  let mode;if(store&&url.pathname==='/device'&&!url.search)mode='device';
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
   if(mode==='device'&&!identity){if(m.t!=='auth'||!(identity=await store.authenticate(m.token)))return deny(ws,'Device credential invalid or revoked');if(!sessions.has(identity))sessions.set(identity,new Set());sessions.get(identity).add(ws);clearTimeout(timeout);send(ws,{t:'authenticated',id:identity});return;}
   if(m.t==='hello'){
    const id=identity;
    if(typeof id!=='string'||typeof m.name!=='string'||!m.name.trim())return;
    if(!await store.active(id))return deny(ws,'Device access revoked');
    if(me&&me.id!==id)return ws.close(4400,'Identity cannot change');
    clearTimeout(timeout);const av=typeof m.av==='string'&&m.av.length<60000&&/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(m.av)?m.av:'';
    if(ws.readyState!==1)return;
    const old=users.get(id),sameSession=old?.ws===ws;
    const platform=['win32','darwin','linux','android-phone','android-tablet','android-tv','web'].includes(m.platform)?m.platform:(sameSession?old.platform:'');
    me={id,name:Array.from(m.name.trim()).slice(0,24).join(''),av,platform,ws,friends:sameSession?old.friends:new Set(),watchCodes:sameSession?old.watchCodes:new Set(),notifyIds:sameSession?old.notifyIds:new Set()};users.set(id,me);if(old&&old.ws!==ws)old.ws.close(4000,'Connected on another session');broadcast();
   }else if(m.t==='keepalive'&&me){
    send(ws,{t:'alive'});
   }else if(m.t==='watch'&&me&&Array.isArray(m.friends)&&Array.isArray(m.codes)&&Array.isArray(m.notify)){
    if(m.friends.length>200||m.codes.length>200||m.notify.length>200)return ws.close(4400,'Invalid friend list');
    me.friends=new Set(m.friends.filter(id=>typeof id==='string'&&/^[A-Za-z0-9-]{16,64}$/.test(id)&&id!==me.id));
    me.watchCodes=new Set(m.codes.filter(code=>typeof code==='string'&&/^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code)));
    me.notifyIds=new Set(m.notify.filter(id=>typeof id==='string'&&/^[A-Za-z0-9-]{16,64}$/.test(id)&&id!==me.id));
    broadcast();
   }else if(m.t==='lookup'&&me&&typeof m.code==='string'&&/^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(m.code)){
    if(!limit('lookup:'+identity,20,60000))return;
    const target=[...users.values()].find(u=>codeFor(u.id)===m.code);if(target)send(ws,{t:'resolved',id:target.id,code:m.code});
   }else if(m.t==='sig'&&me&&typeof m.to==='string'&&m.data&&typeof m.data==='object'){
    const to=users.get(m.to);if(!to)return;
    const friendSignal=['fr','fa','fd','fx'].includes(m.data.t);
    if(!friendSignal&&!(me.friends.has(to.id)&&to.friends.has(me.id)))return;
    send(to.ws,{t:'sig',from:me.id,data:m.data});
   }
  }).catch(()=>ws.close(1011,'Authentication service unavailable')); });
  ws.on('close',()=>{clearTimeout(timeout);if(identity){sessions.get(identity)?.delete(ws);if(sessions.get(identity)?.size===0)sessions.delete(identity);}ipConnections.set(ip,Math.max(0,(ipConnections.get(ip)||1)-1));if(ipConnections.get(ip)===0)ipConnections.delete(ip);if(me&&users.get(me.id)?.ws===ws){users.delete(me.id);broadcast();}});
 });
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const[k,b]of buckets)if(b.until<Date.now())buckets.delete(k);},10000);heartbeat.unref();
 return {server:srv,store,users,close:async()=>{clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));if(srv.listening)await new Promise(resolve=>srv.close(resolve));await store?.close?.();}};
}
module.exports={createServer};
if(require.main===module){(async()=>{try{const instance=createServer();if(instance.store?.ready)await instance.store.ready;instance.server.listen(process.env.PORT||8080,()=>console.log('DROPLY signaling ready; enrollment storage: '+!!instance.store+'; authenticated devices only'));const stop=()=>instance.close().then(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);}catch{console.error('Cannot open authentication storage. Restore storage or correct configuration; identities were not reset.');process.exit(1);}})();}
