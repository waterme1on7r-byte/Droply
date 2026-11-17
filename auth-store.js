'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
function codeFor(id) {
 const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ', bytes=crypto.createHash('sha256').update('droply-device:'+id).digest();let out='',acc=0,bits=0;
 for(const b of bytes){acc=((acc<<8)|b)&0xffff;bits+=8;while(bits>=5&&out.length<12){out+=alphabet[(acc>>(bits-5))&31];bits-=5;}if(out.length===12)break;}
 return 'DRP-'+out.match(/.{4}/g).join('-');
}
function createRegistry(initial, persist, now=Date.now) {
 let state=initial;
 if(state.version!==1||!state.devices||!state.invites)throw Error('Invalid auth store; restore backup instead of resetting identities');
 function save(next){persist(next);state=next;}
 function clone(){return JSON.parse(JSON.stringify(state));}
 return {
  register(id,token){
   if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(id)||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
   const existing=state.devices[id];if(existing)return !existing.revoked&&existing.hash===hash(token)?{id}:null;
   if(Object.keys(state.devices).length>=10000)throw Error('Device capacity reached');
   const next=clone();next.devices[id]={hash:hash(token),code:codeFor(id),revoked:false,created:now()};save(next);return {id};
  },
  invite(code, ttl=900000, replace=false){if(!CODE.test(code))throw Error('A valid target device code is required');if(!Number.isFinite(ttl)||ttl<60000||ttl>86400000)throw Error('Invalid invitation lifetime');const next=clone();for(const[k,v]of Object.entries(next.invites))if(v.expires<=now())delete next.invites[k];if(Object.keys(next.invites).length>=1000)throw Error('Too many pending invitations');const token=crypto.randomBytes(32).toString('base64url');next.invites[hash(token)]={code,expires:now()+ttl,replace:replace===true};save(next);return {invitation:token,expires:now()+ttl,code};},
  enroll(invitation,id){if(typeof invitation!=='string'||invitation.length>128||typeof id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(id))return null;const entry=state.invites[hash(invitation)];if(!entry||entry.expires<=now()||entry.code!==codeFor(id))return null;if(state.devices[id]&&!state.devices[id].revoked&&!entry.replace)return null;if(!state.devices[id]&&Object.keys(state.devices).length>=10000)throw Error('Device capacity reached');const next=clone(),token=crypto.randomBytes(32).toString('base64url');next.devices[id]={hash:hash(token),code:entry.code,revoked:false,created:now()};delete next.invites[hash(invitation)];save(next);return {id,token};},
  authenticate(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const h=hash(token);return Object.keys(state.devices).find(id=>!state.devices[id].revoked&&state.devices[id].hash===h)||null;},
  active(id){return !!state.devices[id]&&!state.devices[id].revoked;},
  registered(id){return !!state.devices[id];},
  revoke(code){const next=clone(),ids=Object.keys(next.devices).filter(id=>next.devices[id].code===code);for(const id of ids)next.devices[id].revoked=true;save(next);return ids;},
  devices(){return Object.entries(state.devices).map(([id,d])=>({id,code:d.code,revoked:d.revoked,created:d.created}));}
 };
}
function createStore(file, now=Date.now) {
 let state={version:1,devices:{},invites:{}};
 if(fs.existsSync(file))state=JSON.parse(fs.readFileSync(file,'utf8'));
 fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
 const save=next=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,file);};
 const registry=createRegistry(state,save,now);save(state);return registry;
}
module.exports={createStore,createRegistry,codeFor,hash};
