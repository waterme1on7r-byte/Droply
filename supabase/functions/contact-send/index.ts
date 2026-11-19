/**
 * Droply marketing contact form — public POST endpoint.
 * Stores messages in an RLS-protected inbox, not the desktop app.
 * Never expose the privileged Supabase API key to browsers or GitHub Pages.
 */
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { normalizeEmail } from "../_shared/newsletter.ts";

const encoder = new TextEncoder();
const MAX_BYTES = 8192;
const allowed = new Set(
  (Deno.env.get("CONTACT_ALLOWED_ORIGINS") || "https://waterme1on7r-byte.github.io")
    .split(",").map((s) => s.trim()).filter(Boolean)
);

function cors(origin: string | null): Headers {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type"
  });
  if (origin && allowed.has(origin)) h.set("Access-Control-Allow-Origin", origin);
  return h;
}
function reply(code: number, message: string, headers: Headers, ok = false): Response {
  return new Response(JSON.stringify({ ok, message }), { status: code, headers });
}
function privilegedKey(): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch { /* fall back to legacy variable */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
}
async function readSmallBody(req: Request): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel("too large");
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function hashBucket(key: CryptoKey, text: string): Promise<string> {
  const result = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
  return Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
}
async function quota(client: ReturnType<typeof createClient>, secret: CryptoKey, name: string, limit: number, windowSeconds: number): Promise<boolean> {
  const hash = await hashBucket(secret, name);
  const { data, error } = await client.rpc("contact_take_quota", {
    p_bucket: hash, p_max_attempts: limit, p_ttl_seconds: windowSeconds
  });
  if (error) {
    console.error("contact quota failed:", error.code || "unknown");
    return false; // fail closed
  }
  return data === true;
}
async function turnstileOk(token: string, secret: string): Promise<boolean> {
  if (!token) return false;
  const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(7000)
  });
  return check.ok && (await check.json())?.success === true;
}
function validate(value: unknown): { name: string; email: string; message: string; honeypot: boolean; token: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim().replace(/\s+/g, " ") : "";
  const email = normalizeEmail(v.email);
  const message = typeof v.message === "string" ? v.message.trim() : "";
  const website = typeof v.website === "string" ? v.website : "";
  const token = typeof v.turnstileToken === "string" ? v.turnstileToken : "";
  if (name.length < 1 || name.length > 80 || !email || message.length < 10 || message.length > 3000 ||
      website.length > 512 || token.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(name) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
    return null;
  }
  return { name, email, message, honeypot: website.length > 0, token };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  const headers = cors(origin);
  if (!origin || !allowed.has(origin)) return reply(403, "This contact form origin is not allowed.", headers);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return reply(405, "Method not allowed.", headers);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("Content-Type") || "")) {
    return reply(415, "Send JSON.", headers);
  }
  const length = req.headers.get("Content-Length");
  if (length && Number(length) > MAX_BYTES) return reply(413, "Message too large.", headers);

  try {
    const bodyText = await readSmallBody(req);
    if (bodyText === null) return reply(413, "Message too large.", headers);
    let json: unknown;
    try { json = JSON.parse(bodyText); }
    catch { return reply(400, "Invalid request.", headers); }

    const form = validate(json);
    if (!form) return reply(422, "Check your name, email and message, then try again.", headers);
    if (form.honeypot) return reply(200, "Thanks, your message was received.", headers, true);

    const url = Deno.env.get("SUPABASE_URL");
    const secret = privilegedKey();
    if (!url || !secret) return reply(503, "Contact is temporarily unavailable.", headers);

    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const hmac = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const hour = Math.floor(Date.now() / 3_600_000);
    const day = Math.floor(Date.now() / 86_400_000);
    // Origin is not authentication; use global and per-email limits even if
    // intermediary-supplied IP information is unavailable or spoofed.
    const ip = (
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      ""
    ).trim().slice(0, 64);

    const turnstileSecret = Deno.env.get("CONTACT_TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      let passed = false;
      try { passed = await turnstileOk(form.token, turnstileSecret); }
      catch { passed = false; }
      if (!passed) return reply(400, "Please complete the anti-spam check.", headers);
    }

    // Challenge and per-caller limits run before the shared capacity guard so
    // one rejected caller cannot spend the allowance available to everyone.
    if ((ip && !await quota(admin, hmac, "contact:ip:" + ip + ":" + hour, 6, 3600)) ||
        !await quota(admin, hmac, "contact:email:" + form.email + ":" + day, 4, 86400) ||
        !await quota(admin, hmac, "contact:all:" + hour, 100, 3600)) {
      return reply(429, "Too many messages. Please try again later.", headers);
    }
    const { error } = await admin.from("contact_messages").insert({
      sender_name: form.name, sender_email: form.email, body: form.message
    });
    if (error) {
      console.error("contact inbox write failed:", error.code || "unknown");
      return reply(503, "Unable to send right now. Please try again later.", headers);
    }
    return reply(200, "Message received. Thank you for contacting Droply!", headers, true);
  } catch (err) {
    console.error("contact endpoint error:", err instanceof Error ? err.name : "unknown");
    return reply(503, "Unable to send right now. Please try again later.", headers);
  }
});
