'use strict';
const fs=require('fs'),path=require('path');
const WebSocket=require('ws');
function validateServer(value){const u=new URL(value);if(u.username||u.password||u.search||u.hash)throw Error('Server URL must not contain credentials or query parameters');if(u.protocol!=='wss:'&&!(u.protocol==='ws:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Secure WSS is required outside localhost');return u;}
function createAccess({app,ipcMain,safeStorage,fromUI,toUI,getProfile,serverURL,fetcher=fetch,Socket=WebSocket}){
 const base=validateServer(serverURL),origin=base.origin,file=path.join(app.getPath('userData'),'device-access.json');
 let needsRegistration=false,registering=false,socket=null,retryTimer=null,stopped=false,attempt=0,authenticated=false,last={state:'idle',text:'Connecting...'},busy=false;
 let pingTimer=null,pongDeadline=null,waitingForPong=false;
 function clearHeartbeat(){
  clearInterval(pingTimer);clearTimeout(pongDeadline);
  pingTimer=null;pongDeadline=null;waitingForPong=false;
 }
 function probeSocket(){
  const current=socket;
  if(stopped||!authenticated||!current||current.readyState!==1||waitingForPong)return;
  waitingForPong=true;
  pongDeadline=setTimeout(()=>{
   if(socket===current&&waitingForPong){
    // Old WebSocket connections can look open after sleep or a network change.
    // Reconnect so the server will replay pending friend-code resolutions.
    current.terminate();
   }
  },5000);
  pongDeadline.unref?.();
  try{current.ping();}catch{
   clearTimeout(pongDeadline);pongDeadline=null;waitingForPong=false;
   current.terminate();
  }
 }
 function startHeartbeat(current){
  clearHeartbeat();
  current.on('pong',()=>{if(socket===current){waitingForPong=false;clearTimeout(pongDeadline);pongDeadline=null;}});
  pingTimer=setInterval(()=>{if(socket===current)probeSocket();},8000);
  pingTimer.unref?.();
 }
 function checkConnection(){
  if(stopped)return;
  if(socket&&authenticated)probeSocket();
  else if(!socket&&!registering){
   clearTimeout(retryTimer);retryTimer=null;void connect();
  }
 }
 function resume(){
  if(stopped)return;
  // Always refresh after OS sleep: an apparently open socket may be half-dead.
  const old=socket;
  if(old){socket=null;authenticated=false;clearHeartbeat();old.terminate();}
  clearTimeout(retryTimer);retryTimer=null;attempt=0;
  emit('connecting','Reconnecting after wake…');
  void connect();
 }
 const usable=()=>!!safeStorage?.isEncryptionAvailable()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text');
 function emit(state,text){last={state,text};toUI('server-event',{t:'state',...last});}
 function read(){if(!fs.existsSync(file))return null;if(!usable())throw Error('Operating-system credential encryption is unavailable.');const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||data.origin!==origin||data.id!==getProfile().id)throw Error('Saved credential belongs to a different server or device.');needsRegistration=data.registered===false;const token=safeStorage.decryptString(Buffer.from(data.encrypted,'base64'));if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Saved device credential is invalid.');return token;}
 function write(token,registered=true){if(!usable())throw Error('Operating-system credential encryption is unavailable.');const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:1,origin,registered,id:getProfile().id,encrypted:safeStorage.encryptString(token).toString('base64')}),{mode:0o600});fs.renameSync(temp,file);}
 function stop(){stopped=true;clearTimeout(retryTimer);retryTimer=null;clearHeartbeat();const old=socket;socket=null;authenticated=false;old?.terminate();}
 async function connect(){
  if(socket||retryTimer||registering)return;stopped=false;let token;
  try{token=read();}catch(e){emit('locked',e.message+' Your profile and friends have been preserved.');return;}
  if(!token){
   try{token=require('crypto').randomBytes(32).toString('base64url');write(token,false);needsRegistration=true;}
   catch{emit('locked','Secure device storage is unavailable. Your profile has been preserved.');return;}
  }
  if(needsRegistration){
   registering=true;emit('connecting','Connecting...');
   try{
    const url=new URL('/auth/register',base);url.protocol=base.protocol==='wss:'?'https:':'http:';
    const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:getProfile().id,token}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.status===409){emit('locked','This device is already registered. Open Settings → Device access to recover it with a one-time invitation.');return;}
    if(!response.ok)throw Error('Registration unavailable');
    const result=await response.json();if(result.id!==getProfile().id)throw Error('Identity mismatch');
    write(token,true);needsRegistration=false;
   }catch{schedule();return;}finally{registering=false;}
   if(stopped)return;
  }
  emit('connecting','Connecting securely...');
  let current;try{current=new Socket(new URL('/device', base).href,{handshakeTimeout:15000,followRedirects:false,maxPayload:1<<20,perMessageDeflate:false});}catch{schedule();return;}
  socket=current;let denied=false;
  current.on('open',()=>{if(socket===current)current.send(JSON.stringify({t:'auth',token}));});
  const deadline=setTimeout(()=>{if(socket===current&&!authenticated)current.terminate();},15000);deadline.unref();
  current.on('message',raw=>{if(socket!==current)return;let m;try{m=JSON.parse(raw);}catch{return;}if(m.t==='access-denied'){denied=true;authenticated=false;emit('enrollment-required','This device could not connect. Please contact support if it persists.');current.close();return;}if(m.t==='authenticated'){
   if(m.id!==getProfile().id){denied=true;current.close();emit('locked','Server identity mismatch. Ask the administrator for help.');return;}
   clearTimeout(deadline);authenticated=true;attempt=0;const p=getProfile();current.send(JSON.stringify({t:'hello',id:p.id,name:p.name,av:p.avatar}));startHeartbeat(current);emit('connected','Connected securely');
  }else if(authenticated&&(m.t==='peers'||m.t==='sig'||m.t==='resolved'))toUI('server-event',{t:'message',message:m});});
  current.on('error',()=>{});
  current.on('close',code=>{clearTimeout(deadline);if(socket!==current)return;clearHeartbeat();socket=null;authenticated=false;if(code===4401){denied=true;emit('enrollment-required','This device could not connect. Please contact support if it persists.');}if(!stopped&&!denied)schedule();});
 }
 function schedule(){if(stopped||retryTimer)return;emit('offline','Offline - reconnecting securely...');retryTimer=setTimeout(()=>{retryTimer=null;connect();},Math.min(8000,1000*2**Math.min(attempt++,3))+Math.random()*500);retryTimer.unref();}
 const handle=(ch,fn)=>ipcMain.handle(ch,async(e,...args)=>fromUI(e)?fn(...args):null);
 handle('get-access',()=>({configured:fs.existsSync(file),encryptionAvailable:usable(),...last}));
 handle('connect-server',()=>{connect();return last;});
 handle('enroll-device',async invitation=>{
  if(busy)throw Error('An enrollment request is already in progress.');if(typeof invitation!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(invitation.trim()))throw Error('Enter the invitation supplied by your administrator.');if(!usable())throw Error('Secure credential storage is unavailable on this device.');
  busy=true;try{
   const url=new URL('/auth/enroll',base);url.protocol=base.protocol==='wss:'?'https:':'http:';
   const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:getProfile().id,invitation:invitation.trim()}),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){if(response.status===403)throw Error('Invitation is invalid, expired, already used, or belongs to another device.');if(response.status===429)throw Error('Too many attempts. Please wait before trying again.');throw Error('Secure enrollment is not ready on the server. Ask the administrator to finish setup.');}
   const result=await response.json();if(result.id!==getProfile().id||! /^[A-Za-z0-9_-]{43}$/.test(result.token))throw Error('Invalid server enrollment response.');write(result.token);stop();stopped=false;connect();return {enrolled:true};
  }catch(e){if(e.name==='TimeoutError'||e.name==='TypeError')throw Error('Could not reach the enrollment server. Check your connection.');throw e;}finally{busy=false;}
 });
 ipcMain.on('send-signal',(e,m)=>{
  if(!fromUI(e)||!authenticated||socket?.readyState!==1||!m||typeof m!=='object')return;
  if(m.t==='hello'){const p=getProfile();socket.send(JSON.stringify({t:'hello',id:p.id,name:p.name,av:p.avatar}));}
  else if(m.t==='sig'&&typeof m.to==='string'&&m.to.length<=64&&m.data&&typeof m.data==='object'){const encoded=JSON.stringify({t:'sig',to:m.to,data:m.data});if(Buffer.byteLength(encoded)<=1<<20&&socket.bufferedAmount<4*1024*1024)socket.send(encoded);}
  else if(m.t==='watch'&&Array.isArray(m.friends)&&Array.isArray(m.codes)&&Array.isArray(m.notify)){const encoded=JSON.stringify(m);if(Buffer.byteLength(encoded)<=64*1024&&socket.bufferedAmount<4*1024*1024)socket.send(encoded);}
  else if(m.t==='lookup'&&typeof m.code==='string'&&/^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(m.code))socket.send(JSON.stringify(m));
 });
 app.on('before-quit',stop);return {connect,stop,checkConnection,resume};
}
module.exports={createAccess,validateServer};
