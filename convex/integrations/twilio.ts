import type { DeliveryResult } from "../lib/communications";

export async function sendSms(args: {
  to: string;
  body: string;
  callbackUrl: string;
  correlationId: string;
}): Promise<DeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !token || !serviceSid) {
    return { ok: false, category: "permanent", code: "not_configured" };
  }
  const body = new URLSearchParams({
    To: args.to,
    Body: args.body,
    MessagingServiceSid: serviceSid,
    StatusCallback: args.callbackUrl,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Canyon-Creek-Correlation": args.correlationId,
      },
      body,
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    sid?: string;
    code?: number;
  };
  if (response.ok && result.sid) {
    return { ok: true, providerMessageId: result.sid };
  }
  return {
    ok: false,
    category:
      response.status === 429 || response.status >= 500
        ? "transient"
        : "permanent",
    code: result.code ? String(result.code) : `http_${response.status}`,
  };
}
