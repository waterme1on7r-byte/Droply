/**
 * Droply contact admin. Not linked from the public website.
 * The login page has NO inbox data; each API request verifies server-signed
 * bearer tokens and rechecks the private allowlist.
 *
 * Plaintext passwords are NEVER present in this file or browser HTML.
 */
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const enc = new TextEncoder();
const dec = new TextDecoder();
const PROJECT_ORIGIN = "https://zyppzqwqacvdnfiajbpp.supabase.co";
const TOKEN_LIFETIME_SECONDS = 45 * 60;
const MAX_BODY_BYTES = 1024;
const ADMIN_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\"><meta name=\"theme-color\" content=\"#0b1426\">\n<meta name=\"referrer\" content=\"no-referrer\">\n<title>Droply · Private inbox</title>\n<style nonce=\"__NONCE__\">\n:root{color-scheme:dark;--bg:#091428;--surface:#102542;--border:#80baff2b;--yellow:#ffe36e;--muted:#bdcbe0;--blue:#559dff;--green:#9bf0ce;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}\n*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 87% 0%,#22508b 0%,#0b1d37 32%,#081225 73%);color:var(--yellow);font-size:14px}\nbutton,input{font:inherit}button{cursor:pointer}a{color:var(--yellow)}\nbutton:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #a2d5ff;outline-offset:3px}\n[hidden]{display:none!important}\n.brand{display:flex;align-items:center;gap:12px;font-size:1.48rem;font-weight:800;letter-spacing:-.05em}.logo{width:40px;height:40px;flex:0 0 auto}\n.eyebrow{display:block;color:#9fc9ff;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.16em}\n.signin-layout{min-height:100vh;display:grid;place-items:center;padding:28px 18px}\n.signin-card{width:min(100%,455px);padding:clamp(26px,6vw,44px);border:1px solid #84b6f74a;border-radius:26px;background:linear-gradient(145deg,#163257,#0c1c34 68%);box-shadow:0 27px 75px #0007,inset 0 1px #ffffff11}\n.signin-card h1{font-size:clamp(2.3rem,6vw,3rem);letter-spacing:-.06em;margin:35px 0 10px;line-height:1.06}\n.muted{color:var(--muted);line-height:1.7}.signin-intro{margin:0 0 28px}\n.field{display:grid;gap:8px;margin:17px 0}.field label{font-size:.8rem;font-weight:700;color:#ffe9a1}.field input{width:100%;min-height:50px;border:1px solid #9bbbe15b;border-radius:12px;background:#07182f;color:var(--yellow);padding:13px 15px;outline:none}.field input::placeholder{color:#a8b7cb}\n.field input:focus{border-color:#97cfff;box-shadow:0 0 0 3px #579bff24}\n.primary{background:var(--yellow);color:#0c1d38;border:1px solid #ffe36e;font-weight:800;border-radius:999px;min-height:47px;padding:12px 20px;transition:transform .18s,box-shadow .18s}\n.primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 28px #ffe36e25}.primary:disabled{opacity:.6;cursor:wait}\n.wide{width:100%;margin-top:12px}.feedback{min-height:22px;margin:14px 0 0;color:#ffd4bd;font-size:.85rem}\n.private-note{font-size:.77rem;margin:24px 0 0;color:#a9bfd6}\n.app{max-width:1480px;margin:0 auto;padding:clamp(15px,3vw,38px)}\n.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:0 0 32px;border-bottom:1px solid var(--border)}\n.top-right{display:flex;align-items:center;gap:13px;flex-wrap:wrap}.user-pill{background:#122d50;border:1px solid #80bcff4a;color:#c8deee;border-radius:99px;padding:9px 15px;font-weight:650}\n.ghost{border:1px solid #91c0fc5c;background:#133051;color:#dbeaff;border-radius:99px;padding:9px 17px;font-weight:700}\n.ghost:hover{background:#214675}.ghost:disabled{opacity:.5;cursor:wait}\n.titlebar{margin:32px 0 24px;display:flex;align-items:end;justify-content:space-between;gap:15px;flex-wrap:wrap}\n.titlebar h1{font-size:clamp(2.4rem,5vw,4rem);letter-spacing:-.06em;line-height:1.1;margin:8px 0 6px}\n.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;margin:20px 0 25px}\n.stat{padding:23px 24px;border:1px solid var(--border);border-radius:20px;background:linear-gradient(140deg,#15355b,#0d2340);box-shadow:inset 0 1px #ffffff0d}\n.stat strong{display:block;margin-top:8px;font-size:2.3rem;letter-spacing:-.05em;color:var(--yellow)}\n.stat span{color:#bad0e6;font-size:.85rem;font-weight:600}\n.workspace{display:grid;grid-template-columns:minmax(290px,.94fr) minmax(0,1.06fr);min-height:500px;gap:18px}\n.panel{min-width:0;border:1px solid var(--border);border-radius:22px;background:#0c1d35de;overflow:hidden}\n.panel-head{padding:20px 22px;border-bottom:1px solid var(--border)}\n.panel-head h2{font-size:1.06rem;margin:0 0 12px;color:#ffebad}\n.search{width:100%;background:#091a33;border:1px solid #8cb8ee4e;border-radius:12px;padding:12px 13px;color:var(--yellow);outline:none}\n.search::placeholder{color:#9faec4}.search:focus{border-color:#89c4ff}\n.filters{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}\n.filter{background:transparent;border:1px solid #8fbdfa38;color:#c2d5e6;border-radius:99px;padding:6px 12px;font-size:.78rem;font-weight:700}\n.filter[aria-pressed=\"true\"]{background:#2d64a86b;border-color:#85c4ff;color:#ffe36e}\n.message-list{min-height:260px;max-height:720px;overflow:auto}\n.message-item{width:100%;display:block;text-align:left;padding:17px 20px;border:0;border-bottom:1px solid #91b9f920;background:transparent;color:inherit}\n.message-item:hover{background:#22487356}.message-item[aria-current=\"true\"]{background:#23508578;border-left:3px solid #ffe36e;padding-left:17px}\n.item-top{display:flex;align-items:center;justify-content:space-between;gap:7px}\n.item-name{font-weight:800;color:#ffe36e;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.item-date{font-size:.72rem;color:#a6c2d9;flex-shrink:0}\n.item-email{display:block;color:#abc9e7;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:5px 0}\n.item-preview{color:#c4d1e0;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:6px 0 7px}\n.status{display:inline-block;font-size:.7rem;font-weight:800;padding:4px 9px;border:1px solid #8bbaf444;background:#123153;border-radius:99px;color:#bcd4eb}\n.status-new{border-color:#ffe36e6d;color:#ffe36e;background:#ffe36e12}\n.status-read{color:#a5d4ff}\n.status-resolved{color:#9cf1cd;border-color:#6ac59c6a}\n.load-more{display:block;margin:13px auto 17px}.empty{padding:44px 25px;text-align:center;color:#bed1e6;line-height:1.65}\n.detail{padding:clamp(22px,3vw,35px);min-height:450px}\n.detail-kicker{font-size:.72rem;font-weight:800;color:#9fc9ff;letter-spacing:.14em;text-transform:uppercase}\n.detail-title{font-size:clamp(1.85rem,3vw,2.45rem);letter-spacing:-.04em;margin:13px 0 6px;color:#ffe36e;overflow-wrap:anywhere}\n.detail-email{font-size:.94rem;color:#a6d1ff;overflow-wrap:anywhere}\n.detail-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;color:#b5cbe1;font-size:.82rem}\n.detail-body{margin:27px 0 28px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:26px 0;color:#e2e9f2;font-size:1.02rem;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;min-height:160px}\n.detail-actions{display:flex;gap:9px;flex-wrap:wrap}.detail-actions button{min-width:114px}\n.helper{font-size:.78rem;color:#a9bdd3;line-height:1.65}\n.feedback-good{color:#a7efc8}.feedback-bad{color:#ffd6b9}\n.footer{margin-top:28px;color:#9badc3;font-size:.75rem;text-align:center;line-height:1.6}\n@media(max-width:790px){.workspace{grid-template-columns:1fr}.message-list{max-height:450px}.detail{min-height:350px}.cards{gap:10px}.stat{padding:17px}.stat strong{font-size:1.8rem}}\n@media(max-width:480px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.stat{padding:13px}.stat span{font-size:.72rem}.stat strong{font-size:1.5rem}.app{padding:15px}.panel-head{padding:17px}.message-item{padding:15px}.detail{padding:19px}.user-pill{font-size:.76rem}}\n@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n</style>\n</head>\n<body>\n<section id=\"login-view\" class=\"signin-layout\">\n  <main class=\"signin-card\">\n    <div class=\"brand\"><svg class=\"logo\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><defs><linearGradient id=\"lg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#7C6CFF\"/><stop offset=\"1\" stop-color=\"#4F8EFF\"/></linearGradient></defs><rect width=\"64\" height=\"64\" rx=\"16\" fill=\"url(#lg)\"/><path d=\"M32 13C29.4 17.1 20 28.5 20 37a12 12 0 0 0 24 0c0-8.5-9.4-19.9-12-24Z\" fill=\"#fff\"/></svg>Droply</div>\n    <h1>Private inbox.</h1>\n    <p class=\"muted signin-intro\">Contact messages, all in one place. Sign in with an approved administrator account.</p>\n    <form id=\"login-form\">\n      <div class=\"field\"><label for=\"username\">Username</label><input id=\"username\" name=\"username\" autocomplete=\"username\" maxlength=\"24\" required placeholder=\"Username\" autocapitalize=\"none\" spellcheck=\"false\"></div>\n      <div class=\"field\"><label for=\"password\">Password</label><input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\" maxlength=\"128\" required placeholder=\"Password\"></div>\n      <button class=\"primary wide\" id=\"login-button\" type=\"submit\">Sign in to inbox</button>\n      <p class=\"feedback\" id=\"login-feedback\" role=\"status\" aria-live=\"polite\"></p>\n    </form>\n    <p class=\"private-note\">Authorized Droply administrators only. Your access expires automatically.</p>\n  </main>\n</section>\n<div id=\"app-view\" class=\"app\" hidden>\n  <header class=\"topbar\">\n    <div class=\"brand\"><svg class=\"logo\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><defs><linearGradient id=\"lg2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#7C6CFF\"/><stop offset=\"1\" stop-color=\"#4F8EFF\"/></linearGradient></defs><rect width=\"64\" height=\"64\" rx=\"16\" fill=\"url(#lg2)\"/><path d=\"M32 13C29.4 17.1 20 28.5 20 37a12 12 0 0 0 24 0c0-8.5-9.4-19.9-12-24Z\" fill=\"#fff\"/></svg>Droply</div>\n    <div class=\"top-right\"><span class=\"user-pill\" id=\"signed-user\"></span><button type=\"button\" class=\"ghost\" id=\"refresh\">Refresh</button><button type=\"button\" class=\"ghost\" id=\"sign-out\">Sign out</button></div>\n  </header>\n  <div class=\"titlebar\"><div><span class=\"eyebrow\">Private workspace</span><h1>Contact inbox.</h1><span class=\"muted\">Read, organize, and resolve messages sent through Droply.</span></div><div class=\"status status-resolved\">Secured access</div></div>\n  <section class=\"cards\" aria-label=\"Inbox statistics\">\n    <div class=\"stat\"><span>All messages</span><strong id=\"count-all\">—</strong></div>\n    <div class=\"stat\"><span>New</span><strong id=\"count-new\">—</strong></div>\n    <div class=\"stat\"><span>Resolved</span><strong id=\"count-resolved\">—</strong></div>\n  </section>\n  <section class=\"workspace\" aria-label=\"Message browser\">\n    <div class=\"panel\">\n      <div class=\"panel-head\"><h2>Messages</h2><label for=\"search\" class=\"eyebrow\">Search loaded messages</label><input id=\"search\" class=\"search\" type=\"search\" placeholder=\"Search names, email, message…\" autocomplete=\"off\">\n        <div class=\"filters\" role=\"group\" aria-label=\"Filter messages\">\n          <button type=\"button\" class=\"filter\" data-status=\"all\" aria-pressed=\"true\">All</button>\n          <button type=\"button\" class=\"filter\" data-status=\"new\" aria-pressed=\"false\">New</button>\n          <button type=\"button\" class=\"filter\" data-status=\"read\" aria-pressed=\"false\">Read</button>\n          <button type=\"button\" class=\"filter\" data-status=\"resolved\" aria-pressed=\"false\">Resolved</button>\n        </div>\n      </div>\n      <div id=\"message-list\" class=\"message-list\" aria-label=\"Inbox messages\"><div class=\"empty\">Loading inbox…</div></div>\n      <button id=\"load-more\" type=\"button\" class=\"ghost load-more\" hidden>Load older messages</button>\n    </div>\n    <div class=\"panel detail\">\n      <div id=\"detail-empty\"><span class=\"detail-kicker\">Message details</span><h2 class=\"detail-title\">Choose a message.</h2><p class=\"muted\">Select a message on the left to review it here.</p></div>\n      <div id=\"detail-content\" hidden>\n        <span class=\"detail-kicker\">Message details</span><h2 class=\"detail-title\" id=\"detail-name\"></h2>\n        <a class=\"detail-email\" id=\"detail-email\" href=\"#\"></a>\n        <div class=\"detail-meta\"><span id=\"detail-date\"></span><span id=\"detail-status\" class=\"status\"></span></div>\n        <div class=\"detail-body\" id=\"detail-body\"></div>\n        <div class=\"detail-actions\">\n          <button type=\"button\" class=\"ghost\" id=\"mark-new\">Mark new</button>\n          <button type=\"button\" class=\"ghost\" id=\"mark-read\">Mark read</button>\n          <button type=\"button\" class=\"primary\" id=\"mark-resolved\">Resolve</button>\n        </div>\n        <p class=\"helper\" id=\"detail-feedback\" role=\"status\" aria-live=\"polite\"></p>\n      </div>\n    </div>\n  </section>\n  <p class=\"footer\">Private Droply administration · Messages are stored in Supabase, not automatically forwarded to email.</p>\n</div>\n<script nonce=\"__NONCE__\">\n(() => {\n  'use strict';\n  const $ = id => document.getElementById(id);\n  const KEY = 'droply-contact-admin-session';\n  let token = null, all = [], selectedId = null, currentFilter = 'all', offset = 0, totalFilter = 0;\n  const PAGE_SIZE = 50;\n  const fmt = value => {try{return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch{return String(value||'')}};\n  const short = str => String(str||'').replace(/\\s+/g,' ').slice(0,130);\n  async function call(mode, method, body) {\n    const headers = {'Content-Type':'application/json','X-Droply-Admin':'1'};\n    if (token) headers.Authorization = 'Bearer ' + token;\n    const url = new URL(location.href);url.search = '?mode=' + encodeURIComponent(mode);\n    if (mode === 'messages') { url.searchParams.set('offset',String(offset));url.searchParams.set('status',currentFilter); }\n    const res = await fetch(url.href,{method:method||'GET',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});\n    let data={};try{data=await res.json()}catch{}\n    if (!res.ok) {\n      if (res.status===401 && mode!=='login') { signOut('Your session expired. Please sign in again.');throw Error('Session expired'); }\n      throw Error(data.message || (res.status===429?'Too many attempts. Please try later.':'Request failed'));\n    }\n    return data;\n  }\n  function signOut(message) {\n    token=null;try{sessionStorage.removeItem(KEY)}catch{}\n    $('app-view').hidden=true;$('login-view').hidden=false;\n    $('password').value='';\n    $('login-feedback').textContent=message||'';\n    all=[];selectedId=null;$('username').focus();\n  }\n  function reveal(user) {\n    $('signed-user').textContent = user + ' · Admin';\n    $('login-view').hidden=true;$('app-view').hidden=false;\n  }\n  $('sign-out').addEventListener('click',()=>signOut('Signed out securely.'));\n  $('login-form').addEventListener('submit',async ev=>{\n    ev.preventDefault();\n    const btn=$('login-button');if(btn.disabled)return;\n    const user=$('username').value.trim().toLowerCase(), password=$('password').value;\n    $('login-feedback').textContent='Signing in…';btn.disabled=true;\n    try {\n      const data=await call('login','POST',{username:user,password});\n      if (!data.token)throw Error('Login failed');\n      token=data.token; try{sessionStorage.setItem(KEY,token)}catch{}\n      $('password').value='';$('login-feedback').textContent='';\n      reveal(data.username);currentFilter='all';offset=0;all=[];\n      await loadMessages(false);\n    } catch(e) {\n      $('login-feedback').textContent=e.message||'Unable to sign in.';\n    } finally {btn.disabled=false;}\n  });\n  $('refresh').addEventListener('click',()=>{offset=0;loadMessages(false)});\n  $('load-more').addEventListener('click',async()=>{offset+=PAGE_SIZE;await loadMessages(true)});\n  document.querySelectorAll('[data-status]').forEach(btn=>btn.addEventListener('click',()=>{\n    currentFilter=btn.dataset.status;offset=0;selectedId=null;\n    document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));\n    loadMessages(false);\n  }));\n  $('search').addEventListener('input',renderList);\n  const txt=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value||'');return el;};\n  function renderList(){\n    const holder=$('message-list');holder.replaceChildren();\n    const q=$('search').value.trim().toLowerCase();\n    const items=all.filter(m=>!q||[m.sender_name,m.sender_email,m.body].some(v=>String(v||'').toLowerCase().includes(q)));\n    if (!items.length){holder.append(txt('div','empty',q?'No loaded messages match your search.':'No messages in this view.'));return;}\n    for (const m of items){\n      const btn=txt('button','message-item','');btn.type='button';\n      btn.setAttribute('aria-current',String(m.id===selectedId));\n      const top=txt('div','item-top','');\n      top.append(txt('strong','item-name',m.sender_name),txt('span','item-date',fmt(m.created_at)));\n      btn.append(top,txt('span','item-email',m.sender_email),txt('p','item-preview',short(m.body)));\n      const st=txt('span','status status-'+m.status,m.status);btn.append(st);\n      btn.addEventListener('click',()=>select(m.id));holder.append(btn);\n    }\n  }\n  function select(id){\n    selectedId=id;const m=all.find(x=>x.id===id);\n    if(!m){$('detail-empty').hidden=false;$('detail-content').hidden=true;renderList();return;}\n    $('detail-empty').hidden=true;$('detail-content').hidden=false;\n    $('detail-name').textContent=m.sender_name;\n    $('detail-email').textContent=m.sender_email;\n    $('detail-email').href='mailto:'+encodeURIComponent(m.sender_email);\n    $('detail-date').textContent=fmt(m.created_at);\n    $('detail-status').textContent=m.status;\n    $('detail-status').className='status status-'+m.status;\n    $('detail-body').textContent=m.body;\n    $('detail-feedback').textContent='';\n    $('mark-new').disabled=m.status==='new';\n    $('mark-read').disabled=m.status==='read';\n    $('mark-resolved').disabled=m.status==='resolved';\n    renderList();\n  }\n  async function loadMessages(append){\n    $('refresh').disabled=true;$('load-more').disabled=true;\n    if (!append){$('message-list').replaceChildren(txt('div','empty','Loading messages…'));all=[];}\n    try{\n      const result=await call('messages','GET');\n      totalFilter=result.totalFiltered||0;\n      all=append?all.concat(result.messages||[]):(result.messages||[]);\n      $('count-all').textContent=result.total||0;\n      $('count-new').textContent=result.newCount||0;\n      $('count-resolved').textContent=result.resolvedCount||0;\n      $('load-more').hidden=all.length>=totalFilter;\n      if (selectedId && all.some(x=>x.id===selectedId))select(selectedId);\n      else {selectedId=null;$('detail-empty').hidden=false;$('detail-content').hidden=true;renderList();}\n    }catch(e){if(token){$('message-list').replaceChildren(txt('div','empty',e.message||'Could not load inbox.'));}}\n    finally{$('refresh').disabled=false;$('load-more').disabled=false;}\n  }\n  async function updateStatus(status){\n    if(!selectedId)return;\n    const id=selectedId;\n    for(const button of [$('mark-new'),$('mark-read'),$('mark-resolved')])button.disabled=true;\n    $('detail-feedback').textContent='Saving…';\n    try{\n      await call('status','POST',{id,status});\n      const m=all.find(x=>x.id===id);if(m)m.status=status;\n      $('detail-feedback').textContent='Saved.';\n      await loadMessages(false);\n    }catch(e){$('detail-feedback').textContent=e.message||'Could not update message.';select(id);}\n  }\n  $('mark-new').addEventListener('click',()=>updateStatus('new'));\n  $('mark-read').addEventListener('click',()=>updateStatus('read'));\n  $('mark-resolved').addEventListener('click',()=>updateStatus('resolved'));\n  try{token=sessionStorage.getItem(KEY)}catch{}\n  if(token){\n    // The server validates this token; client-side possession alone grants nothing.\n    call('whoami','GET').then(data=>{reveal(data.username);loadMessages(false)}).catch(()=>signOut('Please sign in again.'));\n  }\n})();\n</script>\n</body>\n</html>";

function response(status:number, value:Record<string,unknown>, headers:Record<string,string> = {}): Response {
  return new Response(JSON.stringify(value), {status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "X-Robots-Tag":"noindex,nofollow",
    ...headers
  }});
}
function fail(status:number,message:string):Response {return response(status,{ok:false,message});}
function getKey():string|undefined {
  try {
    const key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
    if(typeof key==="string" && key) return key;
  } catch { /* use legacy service role */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||undefined;
}
const toB64=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
function fromB64(value:string):Uint8Array {
  if(!/^[a-zA-Z0-9_-]+$/.test(value)||value.length>4096)throw Error("bad token");
  const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"="));
  return Uint8Array.from(raw, ch=>ch.charCodeAt(0));
}
async function signer(secret:string):Promise<CryptoKey>{
  return crypto.subtle.importKey(
    "raw",enc.encode("droply-contact-admin-session-v1:"+secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]
  );
}
async function newSession(secret:string,username:string,version:number):Promise<string> {
  const now=Math.floor(Date.now()/1000);
  const payload=toB64(enc.encode(JSON.stringify({
    sub:username,ver:version,iat:now,exp:now+TOKEN_LIFETIME_SECONDS,
    aud:"droply-contact-admin",iss:"droply-contact"
  })));
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",await signer(secret),enc.encode(payload)));
  return payload+"."+toB64(sig);
}
async function validateSession(req:Request,admin:ReturnType<typeof createClient>,secret:string):Promise<string|null>{
  const header=req.headers.get("Authorization")||"";
  if(!header.startsWith("Bearer ")||header.length>4200)return null;
  const token=header.slice(7);
  const parts=token.split(".");
  if(parts.length!==2)return null;
  try {
    const verified=await crypto.subtle.verify("HMAC",await signer(secret),fromB64(parts[1]),enc.encode(parts[0]));
    if(!verified)return null;
    const claims=JSON.parse(dec.decode(fromB64(parts[0])));
    const now=Math.floor(Date.now()/1000);
    if(claims.aud!=="droply-contact-admin"||claims.iss!=="droply-contact"||
       !Number.isSafeInteger(claims.exp)||claims.exp<=now||claims.exp>now+TOKEN_LIFETIME_SECONDS||
       !Number.isSafeInteger(claims.iat)||claims.iat>now+30||
       !["anil","cenk"].includes(claims.sub))return null;
    const {data,error}=await admin.from("contact_admin_users")
      .select("active,session_version").eq("username",claims.sub).maybeSingle();
    if(error||!data?.active||data.session_version!==claims.ver)return null;
    return claims.sub;
  } catch {return null;}
}
async function parseBody(req:Request):Promise<Record<string,unknown>|null> {
  const len=req.headers.get("Content-Length");
  if(len&&Number(len)>MAX_BODY_BYTES)return null;
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("Content-Type")||""))return null;
  const raw=await req.text();
  if(enc.encode(raw).byteLength>MAX_BODY_BYTES)return null;
  try {
    const value=JSON.parse(raw);
    return value && typeof value==="object"&&!Array.isArray(value)?value:null;
  }catch{return null;}
}
async function rateLimit(admin:ReturnType<typeof createClient>,secret:string,username:string,ip:string):Promise<boolean>{
  const now=Math.floor(Date.now()/1000);
  const bucket=Math.floor(now/1800);
  const globalWindow=Math.floor(now/3600);
  const key=await signer(secret);
  async function take(value:string,max:number,windowSeconds:number){
    const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode("contact-admin-login:"+value)));
    const hash=Array.from(sig,b=>b.toString(16).padStart(2,"0")).join("");
    const {data,error}=await admin.rpc("contact_take_quota",{
      p_bucket:hash,p_max_attempts:max,p_ttl_seconds:windowSeconds
    });
    return !error&&data===true;
  }
  // Fail closed if the limiter is unavailable. Independent global cap even if
  // a client can spoof a forwarded-IP header.
  return await take("global:"+globalWindow,100,3600) &&
    await take("principal:"+username+":"+ip+":"+bucket,8,1800);
}
function getIp(req:Request):string{
  return (
    req.headers.get("cf-connecting-ip")||
    req.headers.get("x-real-ip")||
    req.headers.get("x-forwarded-for")?.split(",")[0]||
    "unknown"
  ).trim().slice(0,64);
}
function adminPage():Response {
  const random=crypto.getRandomValues(new Uint8Array(16));
  const nonce=toB64(random);
  const csp="default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "+
    "script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; "+
    "connect-src 'self'; img-src 'none'; font-src 'none'; form-action 'none'";
  return new Response(ADMIN_HTML.replaceAll("__NONCE__",nonce),{
    status:200,
    headers:{
      "Content-Type":"text/html; charset=utf-8",
      "Content-Security-Policy":csp,
      "Cache-Control":"no-store, private",
      "Pragma":"no-cache",
      "Referrer-Policy":"no-referrer",
      "X-Robots-Tag":"noindex,nofollow,noarchive",
      "X-Content-Type-Options":"nosniff",
      "X-Frame-Options":"DENY",
      "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
    }
  });
}
Deno.serve(async (req:Request):Promise<Response>=>{
  const url=new URL(req.url);
  const mode=url.searchParams.get("mode")||"page";
  if(mode==="page"&&req.method==="GET")return adminPage();
  if(req.method!=="POST"&&req.method!=="GET")return fail(405,"Method not allowed.");
  if(mode!=="login"&&mode!=="whoami"&&mode!=="messages"&&mode!=="status")
    return fail(404,"Not found.");

  // No cross-origin API. This is not a GitHub Pages endpoint; its form
  // runs on the same Supabase project hostname.
  const origin=req.headers.get("Origin");
  if(origin&&origin!==PROJECT_ORIGIN)return fail(403,"Forbidden.");
  if(req.method==="POST"){
    if(origin!==PROJECT_ORIGIN||req.headers.get("X-Droply-Admin")!=="1")
      return fail(403,"Forbidden.");
  }
  const serviceKey=getKey(),projectUrl=Deno.env.get("SUPABASE_URL");
  if(!serviceKey||!projectUrl)return fail(503,"Admin service unavailable.");
  const admin=createClient(projectUrl,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  try{
    if(mode==="login"){
      if(req.method!=="POST")return fail(405,"Method not allowed.");
      const input=await parseBody(req);
      if(!input)return fail(400,"Invalid sign-in request.");
      const username=typeof input.username==="string"?input.username.trim().toLowerCase():"";
      const password=typeof input.password==="string"?input.password:"";
      if(!/^[a-z]{1,24}$/.test(username)||password.length<1||password.length>128)
        return fail(401,"Invalid username or password.");
      if(!await rateLimit(admin,serviceKey,username,getIp(req)))
        return fail(429,"Too many sign-in attempts. Please try later.");
      const {data:valid,error}=await admin.rpc("contact_admin_check_password",{
        p_username:username,p_password:password
      });
      if(error){console.error("admin auth backend:",error.code||"unknown");return fail(503,"Unable to sign in right now.");}
      if(valid!==true)return fail(401,"Invalid username or password.");
      const {data:account,error:accountError}=await admin.from("contact_admin_users")
        .select("active,session_version").eq("username",username).maybeSingle();
      if(accountError||!account?.active)return fail(401,"Invalid username or password.");
      const token=await newSession(serviceKey,username,account.session_version);
      return response(200,{ok:true,username,token,expiresIn:TOKEN_LIFETIME_SECONDS});
    }
    const identity=await validateSession(req,admin,serviceKey);
    if(!identity)return fail(401,"Unauthorized. Sign in to view the inbox.");
    if(mode==="whoami"){
      if(req.method!=="GET")return fail(405,"Method not allowed.");
      return response(200,{ok:true,username:identity});
    }
    if(mode==="messages"){
      if(req.method!=="GET")return fail(405,"Method not allowed.");
      const offsetValue=Number(url.searchParams.get("offset")||"0");
      if(!Number.isInteger(offsetValue)||offsetValue<0||offsetValue>10000)
        return fail(400,"Invalid page.");
      const status=url.searchParams.get("status")||"all";
      if(!["all","new","read","resolved"].includes(status))return fail(400,"Invalid filter.");
      let query=admin.from("contact_messages")
        .select("id,sender_name,sender_email,body,status,created_at",{count:"exact"})
        .order("created_at",{ascending:false}).range(offsetValue,offsetValue+49);
      if(status!=="all")query=query.eq("status",status);
      const [messagesResult,allResult,newResult,resolvedResult]=await Promise.all([
        query,
        admin.from("contact_messages").select("id",{count:"exact",head:true}),
        admin.from("contact_messages").select("id",{count:"exact",head:true}).eq("status","new"),
        admin.from("contact_messages").select("id",{count:"exact",head:true}).eq("status","resolved")
      ]);
      if(messagesResult.error||allResult.error||newResult.error||resolvedResult.error)
        return fail(503,"Unable to read inbox right now.");
      return response(200,{
        ok:true,messages:messagesResult.data||[],totalFiltered:messagesResult.count||0,
        total:allResult.count||0,newCount:newResult.count||0,resolvedCount:resolvedResult.count||0
      });
    }
    if(mode==="status"){
      if(req.method!=="POST")return fail(405,"Method not allowed.");
      const input=await parseBody(req);
      const id=input?.id, status=input?.status;
      if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||
         !["new","read","resolved"].includes(status as string))
        return fail(422,"Invalid message update.");
      const {data,error}=await admin.from("contact_messages")
        .update({status}).eq("id",id).select("id,status").maybeSingle();
      if(error)return fail(503,"Unable to update this message.");
      if(!data)return fail(404,"Message not found.");
      return response(200,{ok:true,message:data});
    }
    return fail(404,"Not found.");
  }catch(error){
    console.error("admin handler failure:",error instanceof Error?error.name:"unknown");
    return fail(503,"Contact administration is temporarily unavailable.");
  }
});
