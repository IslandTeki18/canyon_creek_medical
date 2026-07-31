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
      // A failed signature is a trust-boundary event: an auditor must be
      // able to find it without reading server logs (12.5).
      await ctx.runMutation(internal.domains.audit.recordSecurityEvent, {
        action: "webhook_signature_failed",
        entityType: "webhook",
        entityId: "clerk",
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
      await ctx.runMutation(internal.domains.audit.recordSecurityEvent, {
        action: "webhook_signature_failed",
        entityType: "webhook",
        entityId: "twilio",
      });
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
      await ctx.runMutation(internal.domains.audit.recordSecurityEvent, {
        action: "webhook_signature_failed",
        entityType: "webhook",
        entityId: "resend",
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

// Authorized document download (11.2). The storage id is never exposed to
// clients; the only route to the bytes is a single-use grant whose
// authorization is re-evaluated here, at download time.
http.route({
  path: "/documents/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return new Response("Not found", { status: 404 });
    const grant = await ctx.runMutation(
      internal.domains.documents.consumeDownloadGrant,
      { token },
    );
    // Expired, replayed, revoked, or unauthorized all look identical.
    if (!grant) return new Response("Not found", { status: 404 });
    const blob = await ctx.storage.get(grant.storageId);
    if (!blob) return new Response("Not found", { status: 404 });
    return new Response(blob, {
      headers: {
        "Content-Type": grant.mimeType,
        // Filename is derived from category and ids only — never PHI.
        "Content-Disposition": `attachment; filename="${grant.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  }),
});

export default http;
