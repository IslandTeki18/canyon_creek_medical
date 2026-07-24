import { query } from "../_generated/server";
import { activeLinkForUser, requireAuthenticatedUser } from "../lib/access";

/**
 * Portal home, scoped through the caller's active patient link. Returns
 * null when the account is not linked yet so the client can offer the
 * invitation activation flow instead.
 */
export const myPortalHome = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthenticatedUser(ctx);
    const link = await activeLinkForUser(ctx, user._id);
    if (!link) return null;
    const patient = await ctx.db.get(link.patientId);
    if (!patient || patient.status !== "active") return null;

    const [preference, contacts, addresses, pharmacies] = await Promise.all([
      ctx.db
        .query("communicationPreferences")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .unique(),
      ctx.db
        .query("emergencyContacts")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect(),
      ctx.db
        .query("patientAddresses")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect(),
      ctx.db
        .query("pharmacies")
        .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
        .collect(),
    ]);

    // Explainable profile-completion checklist; readiness proper lands in 4.6.
    const profileChecklist = [
      { label: "Phone number", complete: Boolean(patient.phone) },
      { label: "Email address", complete: Boolean(patient.email) },
      { label: "Home address", complete: addresses.length > 0 },
      { label: "Emergency contact", complete: contacts.length > 0 },
      { label: "Communication preferences", complete: preference !== null },
      { label: "Preferred pharmacy", complete: pharmacies.length > 0 },
    ];

    return {
      displayName: patient.preferredName ?? patient.legalFirstName,
      profileChecklist,
      profileComplete: profileChecklist.every((i) => i.complete),
    };
  },
});
