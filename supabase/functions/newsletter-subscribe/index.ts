/**
 * Public marketing newsletter endpoint; never used by the desktop app.
 * Receives anonymous POSTs from the Droply website, applies abuse quotas,
 * records affirmative consent, and never returns subscriber identity data.
 */
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { CONSENT_VERSION, parseSignupPayload } from "../_shared/newsletter.ts";

const MAX_BYTES = 2048;
const HOME_ORIGIN = "https://waterme1on7r-byte.github.io";
const enc = new TextEncoder();
const allowed = new Set(
  (Deno.env.get("NEWSLETTER_ALLOWED_ORIGINS") || HOME_ORIGIN)
    .split(",").map((s) => s.trim()).filter(Boolean)
);

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Referrer-Policy": "no-referrer",
  });
  if (origin && allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
function reply(status: number, message: string, headers: Headers, ok = false): Response {
  return new Response(JSON.stringify({ ok, message }), { status, headers });
}
function serverKey(): string | undefined {
  try {
    const map = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof map.default === "string" && map.default) return map.default;
  } catch { /* use legacy key if available */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
}
async function fingerprint(key: CryptoKey, value: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
  return Array.from(mac, (n) => n.toString(16).padStart(2, "0")).join("");
}
async function quota(
  admin: ReturnType<typeof createClient>,
  hmac: CryptoKey,
  label: string,
  max: number,
  ttl: number
): Promise<boolean> {
  const bucket = await fingerprint(hmac, label);
  const { data, error } = await admin.rpc("newsletter_take_quota", {
    p_bucket: bucket, p_max_attempts: max, p_ttl_seconds: ttl,
  });
  // Fail closed when the quota store or its permissions are unavailable.
  if (error) {
    console.error("newsletter quota unavailable:", error.code || "unknown");
    return false;
  }
  return data === true;
}
async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  if (!token) return false;
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(7000),
  });
  if (!result.ok) return false;
  return (await result.json()).success === true;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("Origin");
  const headers = responseHeaders(origin);

  // Reject absent and unexpected Origins. This deters casual cross-site abuse
  // but is NOT treated as authentication; scripts can forge the Origin header.
  if (!origin || !allowed.has(origin)) {
    return reply(403, "This signup source is not allowed.", headers);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return reply(405, "Method not allowed.", headers);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    return reply(415, "Send a JSON request.", headers);
  }
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BYTES) {
    return reply(413, "Request too large.", headers);
  }

  try {
    const raw = await request.text();
    if (enc.encode(raw).byteLength > MAX_BYTES) {
      return reply(413, "Request too large.", headers);
    }
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return reply(400, "Invalid request.", headers); }
    const signup = parseSignupPayload(body);
    if (!signup) {
      return reply(422, "Enter a valid email address and agree to receive updates.", headers);
    }
    // Ignore bot honeypot submissions without creating any records.
    if (signup.honeypotFilled) {
      return reply(200, "Thanks. Your request has been received.", headers, true);
    }

    const secret = serverKey();
    const url = Deno.env.get("SUPABASE_URL");
    if (!secret || !url) {
      return reply(503, "Signups are temporarily unavailable. Please try again later.", headers);
    }
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const hmac = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const now = Date.now();
    // Global circuit breaker (80/hour), per-IP soft limit (6/hour) and per
    // address (3/day). Store only HMAC fingerprints. Each bucket is atomic.
    // Gateway-provided IP headers are advisory/spoofable; the global cap is
    // independent of IP and prevents unbounded database writes.
    const hour = Math.floor(now / 3_600_000);
    const day = Math.floor(now / 86_400_000);
    const ip = (request.headers.get("cf-connecting-ip")
      || request.headers.get("x-real-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || "").trim().slice(0, 64);

    if (!await quota(admin, hmac, "global:" + hour, 80, 3600)) {
      return reply(429, "Too many signups right now. Please try again later.", headers);
    }
    if (ip && !await quota(admin, hmac, "ip:" + ip + ":" + hour, 6, 3600)) {
      return reply(429, "Too many requests. Please try again later.", headers);
    }
    if (!await quota(admin, hmac, "email:" + signup.email + ":" + day, 3, 86400)) {
      return reply(429, "Too many requests. Please try again tomorrow.", headers);
    }

    // Only enforce Turnstile when a private secret and corresponding public
    // widget have both been configured. The rate limits work independently.
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      let valid = false;
      try { valid = await verifyTurnstile(signup.turnstileToken, turnstileSecret); }
      catch { valid = false; }
      if (!valid) return reply(400, "Please complete the anti-spam check.", headers);
    }

    const { error } = await admin.from("newsletter_subscribers").insert({
      email: signup.email,
      status: "subscribed",
      source: "droply-website",
      consent_version: CONSENT_VERSION,
    });

    // Duplicate signup and unsubscribed addresses receive an identical reply.
    // We never disclose whether a particular email was already on the list.
    if (error && error.code !== "23505") {
      console.error("newsletter storage unavailable:", error.code || "unknown");
      return reply(503, "Couldn't save your request. Please try again later.", headers);
    }
    return reply(200, "Thanks! Your email has been added to the Droply newsletter.", headers, true);
  } catch (err) {
    console.error("newsletter request failed:", err instanceof Error ? err.name : "unknown");
    return reply(503, "Signups are temporarily unavailable. Please try again later.", headers);
  }
});
