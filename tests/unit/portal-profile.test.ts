// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createSelfLink } from "../../convex/lib/access";
import schema from "../../convex/schema";
import { seedPatients } from "../fixtures/patients";

const modules = import.meta.glob("../../convex/**/*.ts");

async function linkedPatient(tx: ReturnType<typeof convexTest>) {
  const [patientId] = await seedPatients(tx);
  const userId = await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_self",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Self",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  await tx.run((ctx) =>
    createSelfLink(ctx, {
      patientId,
      userId,
      verificationMethod: "invitation",
    }),
  );
  return { patientId, as: tx.withIdentity({ subject: "user_self" }) };
}

test("patient updates permitted fields; changes get field-level audit", async () => {
  const tx = convexTest(schema, modules);
  const { patientId, as: me } = await linkedPatient(tx);

  await me.mutation(api.domains.portal.updateMyProfile, {
    preferredName: "Avie",
    phone: "555-010-9999",
  });

  const patient = await tx.run((ctx) => ctx.db.get(patientId));
  expect(patient?.preferredName).toBe("Avie");
  expect(patient?.normalizedPhone).toBe("5550109999");
  // Untouched fields (email arg omitted → cleared is expected only when sent)
  expect(patient?.legalFirstName).toBe("Avery");

  const audits = await tx.run((ctx) => ctx.db.query("auditEvents").collect());
  expect(
    audits.some((a) => a.action === "patient.profile.preferredName_changed"),
  ).toBe(true);
  expect(audits.some((a) => a.action === "patient.profile.phone_changed")).toBe(
    true,
  );
  // Audit reasons/actions never contain the new values.
  expect(audits.every((a) => !a.reason?.includes("Avie"))).toBe(true);
});

test("crafted requests cannot change staff-only fields", async () => {
  const tx = convexTest(schema, modules);
  const { patientId, as: me } = await linkedPatient(tx);
  const before = await tx.run((ctx) => ctx.db.get(patientId));

  // Staff-only fields are not part of the validator: the call is rejected.
  await expect(
    me.mutation(api.domains.portal.updateMyProfile, {
      legalFirstName: "Hacked",
    } as never),
  ).rejects.toThrow();

  const after = await tx.run((ctx) => ctx.db.get(patientId));
  expect(after?.legalFirstName).toBe(before?.legalFirstName);
  expect(after?.dateOfBirth).toBe(before?.dateOfBirth);
});

test("unlinked users cannot read or write any profile data", async () => {
  const tx = convexTest(schema, modules);
  await seedPatients(tx);
  await tx.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_unlinked",
      type: "patient" as const,
      status: "active" as const,
      roles: ["patient" as const],
      displayName: "Synthetic Unlinked",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const stranger = tx.withIdentity({ subject: "user_unlinked" });
  await expect(
    stranger.query(api.domains.portal.myProfile, {}),
  ).rejects.toThrow("No linked patient");
  await expect(
    stranger.mutation(api.domains.portal.updateMyProfile, { phone: "1" }),
  ).rejects.toThrow("No linked patient");
});

test("related records upsert once and are scoped to own patient", async () => {
  const tx = convexTest(schema, modules);
  const { patientId, as: me } = await linkedPatient(tx);

  await me.mutation(api.domains.portal.updateMyEmergencyContact, {
    name: "Casey Kin",
    relationship: "Sibling",
    phone: "555-010-2222",
  });
  await me.mutation(api.domains.portal.updateMyEmergencyContact, {
    name: "Casey Kin",
    relationship: "Sibling",
    phone: "555-010-3333",
  });
  const contacts = await tx.run((ctx) =>
    ctx.db.query("emergencyContacts").collect(),
  );
  expect(contacts).toHaveLength(1);
  expect(contacts[0].patientId).toBe(patientId);
  expect(contacts[0].phone).toBe("555-010-3333");

  await me.mutation(api.domains.portal.updateMyCommunicationPreferences, {
    smsOptIn: false,
    emailOptIn: true,
    voiceOptIn: false,
    preferredChannel: "email",
  });
  const prefs = await tx.run((ctx) =>
    ctx.db.query("communicationPreferences").collect(),
  );
  expect(prefs).toHaveLength(1);
  expect(prefs[0].preferredChannel).toBe("email");

  await me.mutation(api.domains.portal.updateMyAddress, {
    line1: "123 Synthetic Way",
    city: "Boise",
    state: "ID",
    postalCode: "83702",
  });
  await me.mutation(api.domains.portal.updateMyPharmacy, {
    name: "Example Pharmacy",
  });
  const home = await me.query(api.domains.portal.myPortalHome, {});
  expect(home?.profileComplete).toBe(true);
});
