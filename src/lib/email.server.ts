// Server-only email helper. Uses Resend via Lovable connector if configured;
// otherwise logs to console (dev fallback).

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export async function sendAppEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!lovableKey || !resendKey) {
    console.warn(`[email:DEV] to=${opts.to} subject="${opts.subject}"\n${opts.html}`);
    return { sent: false, reason: "Resend not configured" };
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "CodeClass <onboarding@resend.dev>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[email] resend error", res.status, text);
      return { sent: false, reason: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] failed", e);
    return { sent: false, reason: String(e) };
  }
}
