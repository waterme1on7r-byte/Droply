/**
 * PREPARED BUT NOT ACTIVE.
 * When the Supabase endpoint works, remove the existing newsletter mailto
 * event listener from docs/index.html BEFORE loading this replacement module.
 * The marketing HTML and desktop app have not been changed.
 */
export function attachNewsletterForm({ endpoint, getTurnstileToken = () => "" }) {
  if (typeof endpoint !== "string") throw new Error("Newsletter endpoint is required.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.pathname.endsWith("/functions/v1/newsletter-subscribe")) {
    throw new Error("Expected an HTTPS Supabase newsletter-subscribe endpoint.");
  }
  const form = document.getElementById("newsletter-form");
  const emailField = document.getElementById("newsletter-email");
  const consentField = document.getElementById("newsletter-consent");
  const feedback = document.getElementById("newsletter-feedback");
  const button = form?.querySelector('button[type="submit"]');
  if (!form || !emailField || !consentField || !feedback || !button) {
    throw new Error("Droply newsletter form markup is missing.");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || button.disabled) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    feedback.textContent = "Signing you up…";
    try {
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailField.value.trim(),
          consent: consentField.checked,
          website: form.elements.namedItem("website")?.value || "",
          turnstileToken: getTurnstileToken() || "",
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Unable to subscribe right now.");
      }
      feedback.textContent = "Thanks! Your signup has been received.";
      form.reset();
    } catch (error) {
      feedback.textContent = error?.name === "AbortError"
        ? "The request timed out. Please try again."
        : error?.message || "Unable to subscribe right now.";
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
}
