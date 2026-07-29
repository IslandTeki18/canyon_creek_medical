import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/logger";
import { normalizedDeliveryState, verifyTwilioSignature } from "./lib/webhooks";

interface ClerkUserData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: Array<{ id: string; email_address: string }>;
  primary_phone_number_id: string | null;
  phone_numbers: Array<{ id: string; phone_number: string }>;
  public_metadata: Record<string, unknown>;
}

interface ClerkEvent {
  type: string;
  data: ClerkUserData;
}

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      logEvent("critical", "clerk.webhook.secret_missing", {});
      return new Response("Webhook not configured", { status: 500 });
    }

    const payload = await request.text();
    const svixId = request.headers.get("svix-id") ?? "";
    let event: ClerkEvent;
    try {
      event = new Webhook(secret).verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      }) as ClerkEvent;
    } catch {
      logEvent("warn", "clerk.webhook.invalid_signature", {
        correlationId: svixId,
      });
      return new Response("Invalid signature", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const d = event.data;
        const email = d.email_addresses.find(
          (e) => e.id === d.primary_email_address_id,
        )?.email_address;
        const phone = d.phone_numbers.find(
          (p) => p.id === d.primary_phone_number_id,
        )?.phone_number;
        await ctx.runMutation(internal.domains.users.upsertFromClerk, {
          clerkUserId: d.id,
          type:
            d.public_metadata?.type === "workforce" ? "workforce" : "patient",
          displayName:
            [d.first_name, d.last_name].filter(Boolean).join(" ") || "Unknown",
          email,
          phone,
        });
        break;
      }
      case "user.deleted":
        await ctx.runMutation(internal.domains.users.deactivateFromClerk, {
          clerkUserId: event.data.id,
        });
        break;
      default:
        // Unhandled event types are acknowledged so Clerk stops retrying.
        logEvent("info", "clerk.webhook.ignored_event", {
          correlationId: svixId,
        });
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/twilio-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const params = new URLSearchParams(await request.text());
    if (
      !token ||
      !(await verifyTwilioSignature({
        token,
        signature,
        url: request.url,
        params,
      }))
    ) {
      logEvent("warn", "twilio.webhook.invalid_signature", {});
      return new Response("Invalid signature", { status: 400 });
    }
    const messageId = params.get("MessageSid");
    const status = params.get("MessageStatus");
    if (!messageId || !status) {
      return new Response("Invalid payload", { status: 400 });
    }
    await ctx.runMutation(internal.domains.communications.applyProviderEvent, {
      provider: "twilio",
      eventId: `${messageId}:${status}`,
      providerMessageId: messageId,
      state: normalizedDeliveryState(status),
    });
    return new Response(null, { status: 200 });
  }),
});

interface ResendEvent {
  type: string;
  data: { email_id?: string };
}

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const payload = await request.text();
    const eventId = request.headers.get("svix-id") ?? "";
    let event: ResendEvent;
    try {
      if (!secret) throw new Error("missing secret");
      event = new Webhook(secret).verify(payload, {
        "svix-id": eventId,
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      }) as ResendEvent;
    } catch {
      logEvent("warn", "resend.webhook.invalid_signature", {
        correlationId: eventId,
      });
      return new Response("Invalid signature", { status: 400 });
    }
    if (!event.data.email_id) {
      return new Response("Invalid payload", { status: 400 });
    }
    await ctx.runMutation(internal.domains.communications.applyProviderEvent, {
      provider: "resend",
      eventId,
      providerMessageId: event.data.email_id,
      state: normalizedDeliveryState(event.type.replace("email.", "")),
    });
    return new Response(null, { status: 200 });
  }),
});

export default http;
