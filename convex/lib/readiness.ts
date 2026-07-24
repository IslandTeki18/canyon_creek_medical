// Readiness: one server-side, explainable calculation used by the staff
// chart and the patient portal. Derived on read — never stored, so it can't
// be accidentally overridden.
// ponytail: insurance/self-pay inputs join when billing data is modeled;
// appointment-specific checks join in Increment 5.

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { assignmentsWithState } from "../domains/assignments";

export interface ReadinessItem {
  label: string;
  kind: "profile" | "form" | "consent";
  satisfied: boolean;
}

export interface Readiness {
  ready: boolean;
  items: ReadinessItem[];
}

export async function buildReadiness(
  ctx: QueryCtx,
  patient: Doc<"patients">,
): Promise<Readiness> {
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

  const items: ReadinessItem[] = [
    {
      label: "Phone number",
      kind: "profile",
      satisfied: Boolean(patient.phone),
    },
    {
      label: "Email address",
      kind: "profile",
      satisfied: Boolean(patient.email),
    },
    { label: "Home address", kind: "profile", satisfied: addresses.length > 0 },
    {
      label: "Emergency contact",
      kind: "profile",
      satisfied: contacts.length > 0,
    },
    {
      label: "Communication preferences",
      kind: "profile",
      satisfied: preference !== null,
    },
    {
      label: "Preferred pharmacy",
      kind: "profile",
      satisfied: pharmacies.length > 0,
    },
  ];

  for (const assignment of await assignmentsWithState(ctx, patient._id)) {
    // Waived requirements are satisfied by definition. Pending assignments on
    // retired templates cannot be completed and are excluded rather than
    // blocking the patient forever; completed history still shows satisfied.
    if (assignment.templateRetired && assignment.state === "pending") continue;
    items.push({
      label: assignment.templateName,
      kind: assignment.templateType === "consent" ? "consent" : "form",
      satisfied: assignment.state !== "pending",
    });
  }

  return { ready: items.every((i) => i.satisfied), items };
}
