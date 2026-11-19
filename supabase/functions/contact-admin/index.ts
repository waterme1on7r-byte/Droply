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
const ADMIN_UI_ORIGIN = "https://waterme1on7r-byte.github.io";
const ADMIN_UI_URL = "https://waterme1on7r-byte.github.io/Droply/portal/contact-inbox.html";
const TOKEN_LIFETIME_SECONDS = 45 * 60;
const MAX_BODY_BYTES = 1024;
const ADMIN_USERS = new Set(["anil", "cenk"]);

function response(status:number, value:Record<string,unknown>, headers:Record<string,string> = {}): Response {
  return new Response(JSON.stringify(value), {status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "X-Robots-Tag":"noindex,nofollow",
    "Access-Control-Allow-Origin":ADMIN_UI_ORIGIN,
    "Access-Control-Allow-Headers":"authorization, content-type, x-droply-admin",
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Vary":"Origin",
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
       !ADMIN_USERS.has(claims.sub))return null;
    const {data,error}=await admin.from("contact_admin_users")
      .select("active,session_version").eq("username",claims.sub).maybeSingle();
    if(error||!data?.active||data.session_version!==claims.ver)return null;
    return claims.sub;
  } catch {return null;}
}
async function parseBody(req:Request,maxBytes=MAX_BODY_BYTES):Promise<Record<string,unknown>|null> {
  const len=req.headers.get("Content-Length");
  if(len&&Number(len)>maxBytes)return null;
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("Content-Type")||""))return null;
  if(!req.body)return null;
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel();return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);
  let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let raw:string;
  try{raw=dec.decode(bytes);}catch{return null;}
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
  // The caller-specific gate runs first; rejected attempts must not consume
  // the shared cap used by both administrators.
  return await take("ip:"+ip+":"+bucket,16,1800) &&
    await take("principal:"+username+":"+ip+":"+bucket,8,1800) &&
    await take("global:"+globalWindow,100,3600);
}
function getIp(req:Request):string{
  return (
    req.headers.get("cf-connecting-ip")||
    req.headers.get("x-real-ip")||
    req.headers.get("x-forwarded-for")?.split(",")[0]||
    "unknown"
  ).trim().slice(0,64);
}
// Standard Supabase Edge Functions rewrite text/html to text/plain.
// Use Pages for login UI and retain Supabase only for authenticated APIs.
function adminPage():Response {
  return new Response(null,{status:302,headers:{
    "Location":ADMIN_UI_URL,"Cache-Control":"no-store",
    "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow,noarchive"
  }});
}

Deno.serve(async (req:Request):Promise<Response>=>{
  const url=new URL(req.url);
  const mode=url.searchParams.get("mode")||"page";
  if(mode==="page"&&req.method==="GET")return adminPage();
  const origin=req.headers.get("Origin");
  // Only the unlinked Pages login UI is granted browser API access.
  // CORS alone is not authentication: all inbox operations verify tokens.
  if(req.method==="OPTIONS"){
    if(origin!==ADMIN_UI_ORIGIN)return fail(403,"Forbidden.");
    return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":ADMIN_UI_ORIGIN,
      "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":"authorization, content-type, x-droply-admin",
      "Access-Control-Max-Age":"300",
      "Vary":"Origin","Cache-Control":"no-store"
    }});
  }
  if(req.method!=="POST"&&req.method!=="GET")return fail(405,"Method not allowed.");
  if(!["login","whoami","messages","status","tickets","ticket-status"].includes(mode))return fail(404,"Not found.");
  if(origin!==ADMIN_UI_ORIGIN||req.headers.get("X-Droply-Admin")!=="1")return fail(403,"Forbidden.");
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
      if(!/^[a-z]{1,24}$/.test(username)||!ADMIN_USERS.has(username)||password.length<1||password.length>128)
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
    if(mode==="messages"||mode==="tickets"){
      if(req.method!=="GET")return fail(405,"Method not allowed.");
      const tickets=mode==="tickets";
      const table=tickets?"support_tickets":"contact_messages";
      const offsetValue=Number(url.searchParams.get("offset")||"0");
      if(!Number.isInteger(offsetValue)||offsetValue<0||offsetValue>10000)
        return fail(400,"Invalid page.");
      const status=url.searchParams.get("status")||"all";
      if(!["all","new","read","resolved"].includes(status))return fail(400,"Invalid filter.");
      let query=admin.from(table)
        .select(tickets
          ? "id,sender_name,sender_email,summary,status,created_at,resolution_note,resolved_by,resolved_at"
          : "id,sender_name,sender_email,body,status,created_at,resolution_note,resolved_by,resolved_at",
          {count:"exact"})
        .order("created_at",{ascending:false}).range(offsetValue,offsetValue+49);
      if(status!=="all")query=query.eq("status",status);
      const [messagesResult,allResult,newResult,resolvedResult]=await Promise.all([
        query,
        admin.from(table).select("id",{count:"exact",head:true}),
        admin.from(table).select("id",{count:"exact",head:true}).eq("status","new"),
        admin.from(table).select("id",{count:"exact",head:true}).eq("status","resolved")
      ]);
      if(messagesResult.error||allResult.error||newResult.error||resolvedResult.error)
        return fail(503,"Unable to read inbox right now.");
      return response(200,{
        ok:true,messages:(messagesResult.data||[]).map((item:Record<string,unknown>)=>({
          ...item,body:tickets?item.summary:item.body
        })),totalFiltered:messagesResult.count||0,
        total:allResult.count||0,newCount:newResult.count||0,resolvedCount:resolvedResult.count||0
      });
    }
    if(mode==="status"||mode==="ticket-status"){
      if(req.method!=="POST")return fail(405,"Method not allowed.");
      const table=mode==="ticket-status"?"support_tickets":"contact_messages";
      // Long resolution notes may use multi-byte UTF-8. Login requests
      // retain the much smaller default body limit above.
      const input=await parseBody(req,12000);
      const id=input?.id, status=input?.status;
      if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||
         !["new","read","resolved"].includes(status as string))
        return fail(422,"Invalid message update.");
      // Resolution notes are required for new resolutions. The server, not
      // the browser, assigns the resolver identity and timestamp.
      const incomingNote=input?.resolutionNote;
      if(status==="resolved" &&
         (typeof incomingNote!=="string" ||
          incomingNote.trim().length<5 ||
          incomingNote.trim().length>2000 ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(incomingNote))) {
        return fail(422,"Please provide a resolution note (5 to 2000 characters).");
      }
      if(status!=="resolved" && incomingNote!==undefined) {
        return fail(422,"Resolution notes can only be saved when resolving.");
      }
      const changes=status==="resolved"
        ? {status,resolution_note:(incomingNote as string).trim(),resolved_by:identity,resolved_at:new Date().toISOString()}
        : {status};
      const {data,error}=await admin.from(table)
        .update(changes).eq("id",id)
        .select("id,status,resolution_note,resolved_by,resolved_at").maybeSingle();
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
