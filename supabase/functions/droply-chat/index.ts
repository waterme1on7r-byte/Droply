/**
 * Droply public support chat and visitor-confirmed ticket creation.
 * Chat advice uses OpenAI only when an operator configures OPENAI_API_KEY +
 * CHAT_OPENAI_MODEL as private Supabase Edge Function secrets.
 * Creating a support ticket works without an OpenAI API key.
 */
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { INSTRUCTIONS } from "./instructions.ts";

const allowed = new Set((Deno.env.get("CHAT_ALLOWED_ORIGINS") || "https://waterme1on7r-byte.github.io").split(",").map(s => s.trim()).filter(Boolean));
const encoder = new TextEncoder();
const MAX_BYTES = 24000;
type Message = { role: "user" | "assistant"; content: string };
function responseHeaders(origin: string|null): Headers {
  const headers = new Headers({
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"content-type"
  });
  if(origin && allowed.has(origin))headers.set("Access-Control-Allow-Origin",origin);
  return headers;
}
function serviceKey():string|undefined{
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    if(typeof keys.default==="string" && keys.default)return keys.default;
  }catch{ /* legacy key fallback */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||undefined;
}
async function readJSON(req:Request):Promise<Record<string,unknown>|null>{
  if(!req.body)return null;
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){await reader.cancel();return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const body=new Uint8Array(bytes);
  let index=0;for(const chunk of chunks){body.set(chunk,index);index+=chunk.length;}
  try{
    const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(body));
    return parsed && typeof parsed==="object" && !Array.isArray(parsed)?parsed:null;
  }catch{return null;}
}
function messagesFrom(value:unknown):Message[]|null{
  if(!Array.isArray(value)||value.length<1||value.length>12)return null;
  const messages:Message[]=[];
  for(const m of value){
    if(!m||typeof m!=="object"||Array.isArray(m)||
       (m.role!=="assistant"&&m.role!=="user")||
       typeof m.content!=="string"||!m.content.trim()||m.content.length>2000)return null;
    messages.push({role:m.role,content:m.content.trim()});
  }
  return messages[messages.length-1].role==="user"?messages:null;
}
function normalizeEmail(value:unknown):string|null{
  if(typeof value!=="string")return null;
  const email=value.trim().toLowerCase();
  if(email.length<3||email.length>254||email.includes("..")||!/\S+@\S+\.\S+/.test(email))return null;
  if(!/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email))return null;
  if(email.split("@")[1].split(".").some(p=>!p||p.length>63||p.startsWith("-")||p.endsWith("-")))return null;
  return email;
}
function ticketFrom(body:Record<string,unknown>){
  const name=typeof body.name==="string"?body.name.trim().replace(/\s+/g," "):"";
  const email=normalizeEmail(body.email);
  const summary=typeof body.summary==="string"?body.summary.trim():"";
  const trap=body.website??"";
  if(name.length<1||name.length>80||!email||summary.length<10||summary.length>4000||
     typeof trap!=="string"||trap.length>512||
     /[\u0000-\u001f\u007f]/.test(name)||
     /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(summary))return null;
  return {name,email,summary,honeypot:trap.length>0};
}
async function bucketHash(key:CryptoKey,label:string){
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(label)));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
async function captchaOk(token:unknown,secret:string){
  if(typeof token!=="string"||!token)return false;
  try{
    const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",body:new URLSearchParams({secret,response:token}),
      signal:AbortSignal.timeout(6500)
    });
    return res.ok&&(await res.json()).success===true;
  }catch{return false;}
}

Deno.serve(async(req:Request):Promise<Response>=>{
  const origin=req.headers.get("Origin");
  const headers=responseHeaders(origin);
  const send=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
  if(!origin||!allowed.has(origin))return send(403,{error:"Origin not allowed."});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return send(405,{error:"Method not allowed."});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("Content-Type")||""))
    return send(415,{error:"Send JSON."});
  const size=Number(req.headers.get("Content-Length")||0);
  if(!Number.isFinite(size)||size>MAX_BYTES)return send(413,{error:"Request too large."});
  try{
    const body=await readJSON(req);
    if(!body)return send(400,{error:"Invalid request."});
    const action=body.action;
    if(action!=="ticket"&&action!=="chat")return send(400,{error:"Unknown request."});
    const key=serviceKey(),url=Deno.env.get("SUPABASE_URL");
    if(!key||!url)return send(503,{error:"Support is temporarily unavailable."});
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const hmac=await crypto.subtle.importKey("raw",encoder.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const hour=Math.floor(Date.now()/3600000),day=Math.floor(Date.now()/86400000);
    const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||
      req.headers.get("x-forwarded-for")?.split(",")[0]||"").trim().slice(0,64);
    async function quota(label:string,limit:number,ttl:number){
      const {data,error}=await admin.rpc("contact_take_quota",{
        p_bucket:await bucketHash(hmac,label),p_max_attempts:limit,p_ttl_seconds:ttl
      });
      if(error)console.error("Support quota unavailable:",error.code||"unknown");
      return !error&&data===true;
    }
    if(action==="ticket"){
      const form=ticketFrom(body);
      if(!form)return send(422,{error:"Enter your name, email and an issue summary of at least 10 characters."});
      if(form.honeypot)return send(200,{ok:true,message:"Thank you. Your request has been received."});
      // Counters are separate from general contact requests and AI chat usage.
      if(!await quota("support-ticket:global:"+hour,60,3600)||
         (ip&&!await quota("support-ticket:ip:"+ip+":"+hour,5,3600))||
         !await quota("support-ticket:email:"+form.email+":"+day,3,86400))
        return send(429,{error:"Too many support requests. Please try again later."});
      const turnstileSecret=Deno.env.get("CHAT_TURNSTILE_SECRET_KEY");
      if(turnstileSecret&&!await captchaOk(body.turnstileToken,turnstileSecret))
        return send(400,{error:"Please complete the spam check."});
      const {data,error}=await admin.from("support_tickets").insert({
        sender_name:form.name,sender_email:form.email,summary:form.summary,source:"droply-chat"
      }).select("id").single();
      if(error||!data?.id){
        console.error("Support ticket write failed:",error?.code||"unknown");
        return send(503,{error:"Ticket could not be saved. Please try again."});
      }
      return send(201,{ok:true,reference:String(data.id).slice(0,8).toUpperCase(),
        message:"Your support ticket was created."});
    }

    const messages=messagesFrom(body.messages);
    if(!messages)return send(400,{error:"Invalid chat message."});
    if(!await quota("support-chat:global:"+hour,100,3600)||
       (ip&&!await quota("support-chat:ip:"+ip+":"+hour,20,3600)))
      return send(429,{error:"Chat is busy. Please try again later."});
    const apiKey=Deno.env.get("OPENAI_API_KEY");
    const model=Deno.env.get("CHAT_OPENAI_MODEL");
    if(!apiKey||!model)return send(503,{error:"AI chat isn't configured yet. You can still create a support ticket."});
    const upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
      body:JSON.stringify({model,instructions:INSTRUCTIONS,input:messages,max_output_tokens:600,store:false}),
      signal:AbortSignal.timeout(25000)
    });
    if(!upstream.ok){
      console.error("AI provider unavailable:",upstream.status);
      return send(503,{error:"Chat is temporarily unavailable. You can create a support ticket."});
    }
    const data=await upstream.json();
    const reply=Array.isArray(data.output)?data.output.flatMap((item:{type?:string;content?:{type?:string;text?:string}[]})=>
      item.type==="message"&&Array.isArray(item.content)
        ? item.content.filter(c=>c.type==="output_text"&&typeof c.text==="string").map(c=>c.text)
        : []).join("\n").trim():"";
    if(!reply)return send(503,{error:"Chat is temporarily unavailable. You can create a support ticket."});
    return send(200,{reply:reply.slice(0,3000)});
  }catch(e){
    console.error("Droply support request failed:",e instanceof Error?e.name:"unknown");
    return send(503,{error:"Support is temporarily unavailable. You can try again."});
  }
});
