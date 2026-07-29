import type { DeliveryResult } from "../lib/communications";

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  correlationId: string;
}): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false, category: "permanent", code: "not_configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": args.correlationId,
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
      headers: { "X-Canyon-Creek-Correlation": args.correlationId },
    }),
  });
  const result = (await response.json().catch(() => ({}))) as { id?: string };
  if (response.ok && result.id) {
    return { ok: true, providerMessageId: result.id };
  }
  return {
    ok: false,
    category:
      response.status === 429 || response.status >= 500
        ? "transient"
        : "permanent",
    code: `http_${response.status}`,
  };
}
