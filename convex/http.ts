import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/logger";

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

export default http;
