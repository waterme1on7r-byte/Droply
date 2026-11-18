// Pure validation helpers, independently testable without Supabase credentials.
export const CONSENT_VERSION = "droply-newsletter-v1-2026-11";

export type Signup = {
  email: string;
  consent: true;
  honeypotFilled: boolean;
  turnstileToken: string;
};

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || email.includes("..")) return null;
  // Moderate syntax validation; do not attempt to verify mailbox deliverability.
  if (!/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(email)) return null;
  const domain = email.split("@")[1];
  if (domain.split(".").some((part) => !part || part.length > 63 || part.startsWith("-") || part.endsWith("-"))) return null;
  return email;
}

export function parseSignupPayload(value: unknown): Signup | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  if (!email || body.consent !== true) return null;
  const honeypot = body.website ?? "";
  if (typeof honeypot !== "string" || honeypot.length > 512) return null;
  const token = body.turnstileToken ?? "";
  if (typeof token !== "string" || token.length > 4096) return null;
  return { email, consent: true, honeypotFilled: honeypot.length > 0, turnstileToken: token };
}
