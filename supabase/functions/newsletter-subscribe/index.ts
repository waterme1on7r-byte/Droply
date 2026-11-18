/**
 * Public newsletter signup endpoint for the Droply marketing website only.
 *
 * POST {"email":"name@example.com","consent":true,"website":"","turnstileToken":""}
 * The "website" field is an invisible honeypot; Turnstile can be enabled later.
 *
 * No service-role or secret key ever goes into docs/index.html.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CONSENT_VERSION, parseSignupPayload } from "../_shared/newsletter.ts";

const DEFAULT_ORIGIN = "https://waterme1on7r-byte.github.io";
const MAX_PAYLOAD_BYTES = 2048;

function getAllowedOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("NEWSLETTER_ALLOWED_ORIGINS") || DEFAULT_ORIGIN)
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
}

function headersFor(origin: string | null, allowedOrigins: Set<string>): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(status: number, body: Record<string, unknown>, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function getServerKey(): string | undefined {
  // Supabase's newer secret API keys are preferred. Legacy service-role keys
  // remain supported while the Supabase project is being configured.
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch {
    // Fall through to the legacy environment variable.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result?.success === true;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("Origin");
  const allowedOrigins = getAllowedOrigins();
  const headers = headersFor(origin, allowedOrigins);

  // Origin allowlisting is a browser CORS control, not an authentication system.
  if (origin && !allowedOrigins.has(origin)) {
    return json(403, { ok: false, message: "Origin not allowed." }, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return json(405, { ok: false, message: "Method not allowed." }, headers);
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return json(415, { ok: false, message: "Send JSON." }, headers);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_PAYLOAD_BYTES) {
    return json(413, { ok: false, message: "Request too large." }, headers);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_PAYLOAD_BYTES) {
      return json(413, { ok: false, message: "Request too large." }, headers);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, message: "Invalid JSON." }, headers);
    }

    const signup = parseSignupPayload(body);
    if (!signup) {
      return json(422, { ok: false, message: "Enter a valid email and agree to receive updates." }, headers);
    }

    // Trap for automated submissions; avoid storing obvious spam.
    if (signup.honeypotFilled) {
      return json(200, { ok: true, message: "Thanks for your interest." }, headers);
    }

    // Optional Cloudflare Turnstile protection for production. When a secret is
    // configured, every signup must include a valid token from the web widget.
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      let valid = false;
      try {
        valid = await verifyTurnstile(signup.turnstileToken, turnstileSecret);
      } catch {
        valid = false;
      }
      if (!valid) return json(400, { ok: false, message: "Please complete the anti-spam check." }, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = getServerKey();
    if (!supabaseUrl || !serviceKey) {
      // Never return details about server-side credentials.
      return json(503, { ok: false, message: "Newsletter signups are temporarily unavailable." }, headers);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.from("newsletter_subscribers").insert({
      email: signup.email,
      status: "subscribed",
      consent_version: CONSENT_VERSION,
      source: "droply-website",
    });

    // A repeated signup receives the same response and does not re-subscribe
    // an address that someone previously unsubscribed.
    if (error && error.code !== "23505") {
      console.error("Newsletter insert failed", error.code || "unknown");
      return json(503, { ok: false, message: "Could not save your signup. Please try again later." }, headers);
    }
    return json(200, { ok: true, message: "Thanks! Your signup has been received." }, headers);
  } catch {
    return json(503, { ok: false, message: "Newsletter signups are temporarily unavailable." }, headers);
  }
});
