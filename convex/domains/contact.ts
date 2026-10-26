import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { verifyCaptcha } from "../integrations/turnstile";
import { requireCapability } from "../lib/access";
import { writeAudit } from "../lib/audit";

const inquiryFields = {
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.string()),
  message: v.string(),
};
const inquiryStatus = v.union(
  v.literal("new"),
  v.literal("handled"),
  v.literal("archived"),
);
const inquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").max(254),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1, "Message is required").max(2000),
  website: z.string().max(0).optional(),
});

export const submitInquiry = action({
  args: {
    ...inquiryFields,
    website: v.optional(v.string()),
    captchaToken: v.string(),
  },
  handler: async (
    ctx,
    { captchaToken, ...inquiry },
  ): Promise<{ ok: true } | { ok: false; reason: "captcha" }> => {
    if (inquiry.website) return { ok: true };
    const parsed = inquirySchema.safeParse(inquiry);
    if (!parsed.success) {
      throw new ConvexError({
        code: "INVALID_INQUIRY",
        issues: parsed.error.issues.map(({ path, message }) => ({
          path: path.join("."),
          message,
        })),
      });
    }
    const captcha = await verifyCaptcha(captchaToken);
    const environment = process.env.APP_ENV;
    const development = !["preview", "staging", "production"].includes(
      environment ?? "",
    );
    if (!captcha.ok && !(captcha.reason === "not_configured" && development)) {
      return { ok: false, reason: "captcha" };
    }
    const { website: _website, ...data } = parsed.data;
    await ctx.runMutation(internal.domains.contact.insertInquiry, data);
    return { ok: true };
  },
});

export const insertInquiry = internalMutation({
  args: inquiryFields,
  handler: async (ctx, inquiry) => {
    const now = Date.now();
    const entityId = await ctx.db.insert("contactInquiries", {
      ...inquiry,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "contact.inquiry.submitted",
      entityType: "contactInquiry",
      entityId,
    });
  },
});

export const listInquiries = query({
  args: { status: v.optional(inquiryStatus) },
  handler: async (ctx, { status }) => {
    await requireCapability(ctx, "config.manage");
    if (status) {
      return await ctx.db
        .query("contactInquiries")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .order("desc")
        .take(200);
    }
    const groups = await Promise.all(
      (["new", "handled"] as const).map((value) =>
        ctx.db
          .query("contactInquiries")
          .withIndex("by_status_created", (q) => q.eq("status", value))
          .order("desc")
          .take(200),
      ),
    );
    return groups
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
  },
});

export const setInquiryStatus = mutation({
  args: {
    inquiryId: v.id("contactInquiries"),
    status: v.union(v.literal("handled"), v.literal("archived")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { inquiryId, status, reason: rawReason }) => {
    const actor = await requireCapability(ctx, "config.manage");
    const reason = status === "archived" ? rawReason?.trim() : undefined;
    if (status === "archived" && !reason)
      throw new ConvexError({ code: "REASON_REQUIRED" });
    const inquiry = await ctx.db.get(inquiryId);
    if (!inquiry) throw new ConvexError({ code: "INQUIRY_NOT_FOUND" });
    if (
      inquiry.status === "archived" ||
      (status === "handled" && inquiry.status !== "new")
    ) {
      throw new ConvexError({ code: "INVALID_STATUS_TRANSITION" });
    }
    const now = Date.now();
    await ctx.db.patch(inquiryId, {
      status,
      handledByUserId: actor._id,
      handledAt: now,
      archiveReason: reason,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      actor,
      action: `contact.inquiry.${status}`,
      entityType: "contactInquiry",
      entityId: inquiryId,
      reason,
    });
  },
});
