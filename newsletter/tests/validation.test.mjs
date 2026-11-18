// Run with Node 22.16+: node --test newsletter/tests/validation.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSION, normalizeEmail, parseSignupPayload } from "../../supabase/functions/_shared/newsletter.ts";

test("canonicalizes normal email addresses", () => {
  assert.equal(normalizeEmail("  Team+Updates@Example.COM "), "team+updates@example.com");
  assert.equal(normalizeEmail("hello@example.org"), "hello@example.org");
});
test("rejects invalid or excessively long email addresses", () => {
  for (const value of [null, 42, "", "bad", "a@@example.com", "a@ex..ample.com", "a@-bad.com", "a@example", "x".repeat(260) + "@test.com"]) {
    assert.equal(normalizeEmail(value), null, String(value));
  }
});
test("requires explicit opt-in consent", () => {
  assert.equal(parseSignupPayload({ email: "a@example.com", consent: false }), null);
  assert.equal(parseSignupPayload({ email: "a@example.com" }), null);
  assert.equal(parseSignupPayload({ email: "a@example.com", consent: "true" }), null);
  assert.equal(parseSignupPayload(null), null);
});
test("parses a valid signup", () => {
  assert.deepEqual(parseSignupPayload({ email: "A@Example.com", consent: true, website: "", turnstileToken: "token" }), {
    email: "a@example.com", consent: true, honeypotFilled: false, turnstileToken: "token"
  });
});
test("flags bot honeypot submissions", () => {
  assert.equal(parseSignupPayload({ email: "a@example.com", consent: true, website: "spam" })?.honeypotFilled, true);
});
test("tracks consent text version", () => {
  assert.equal(CONSENT_VERSION, "droply-newsletter-v1-2026-11");
});
