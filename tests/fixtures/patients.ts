// Synthetic patient fixtures — never real data.
import type { convexTest } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import {
  buildSearchText,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "../../convex/lib/patients";

export interface PatientFixture {
  legalFirstName: string;
  legalLastName: string;
  preferredName?: string;
  dateOfBirth: string;
  email?: string;
  phone?: string;
}

export const SYNTHETIC_PATIENTS: PatientFixture[] = [
  {
    legalFirstName: "Avery",
    legalLastName: "Testerson",
    preferredName: "Ave",
    dateOfBirth: "1985-03-14",
    email: "avery.testerson@example.com",
    phone: "(555) 010-1001",
  },
  {
    legalFirstName: "Blake",
    legalLastName: "Sampleton",
    dateOfBirth: "1992-11-02",
    email: "blake.sampleton@example.com",
    phone: "555-010-1002",
  },
  {
    legalFirstName: "Casey",
    legalLastName: "Testerson",
    dateOfBirth: "1985-03-14",
    phone: "5550101003",
  },
];

/** Seeds a workforce user (for createdBy) and the synthetic patients. */
export async function seedPatients(
  tx: ReturnType<typeof convexTest>,
  fixtures: PatientFixture[] = SYNTHETIC_PATIENTS,
): Promise<Id<"patients">[]> {
  return await tx.run(async (ctx) => {
    const staffId = await ctx.db.insert("users", {
      clerkUserId: "user_fixture_staff",
      type: "workforce",
      status: "active",
      roles: ["frontDesk"],
      displayName: "Fixture Staff",
      createdAt: 0,
      updatedAt: 0,
    });
    const ids: Id<"patients">[] = [];
    for (const f of fixtures) {
      ids.push(
        await ctx.db.insert("patients", {
          ...f,
          status: "active",
          normalizedLastName: normalizeName(f.legalLastName),
          normalizedEmail: normalizeEmail(f.email),
          normalizedPhone: normalizePhone(f.phone),
          searchText: buildSearchText(f),
          createdByUserId: staffId,
          createdAt: 0,
          updatedAt: 0,
        }),
      );
    }
    return ids;
  });
}
