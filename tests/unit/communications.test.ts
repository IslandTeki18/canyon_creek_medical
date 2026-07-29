// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  communicationIdempotencyKey,
  renderNeutralTemplate,
  retryAt,
  validateNeutralTemplate,
} from "../../convex/lib/communications";
import {
  normalizedDeliveryState,
  verifyTwilioSignature,
} from "../../convex/lib/webhooks";
import { sendEmail } from "../../convex/integrations/resend";
import { sendSms } from "../../convex/integrations/twilio";
import { zonedTimeToUtc } from "../../convex/lib/time";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedPatients } from "../fixtures/patients";
import { seedSchedulingWorld, TZ } from "../fixtures/scheduling";

const modules = import.meta.glob("../../convex/**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("neutral communication boundary", () => {
  test("allows only approved variables and rejects clinical wording", () => {
    expect(
      renderNeutralTemplate("Call {{practicePhone}}", {
        practicePhone: "(555) 010-0200",
      }),
    ).toBe("Call (555) 010-0200");
    expect(() =>
      validateNeutralTemplate(undefined, "Hello {{patientName}}"),
    ).toThrow("Unknown template variable");
    expect(() =>
      validateNeutralTemplate(undefined, "Your medication appointment"),
    ).toThrow("prohibited clinical wording");
  });

  test("uses deterministic keys, bounded retry, and normalized callbacks", () => {
    const input = {
      intent: "appointmentReminder",
      patientId: "patient",
      referenceId: "appointment",
      channel: "sms",
      schedulePoint: 10,
    };
    expect(communicationIdempotencyKey(input)).toBe(
      communicationIdempotencyKey(input),
    );
    expect(retryAt(0, 1)).toBe(60_000);
    expect(retryAt(0, 3)).toBe(1_800_000);
    expect(retryAt(0, 4)).toBeNull();
    expect(normalizedDeliveryState("delivered")).toBe("delivered");
    expect(normalizedDeliveryState("bounced")).toBe("failed");
  });

  test("rejects forged Twilio signatures", async () => {
    await expect(
      verifyTwilioSignature({
        token: "synthetic-token",
        signature: "forged",
        url: "https://example.test/twilio-status",
        params: new URLSearchParams({
          MessageSid: "synthetic-message",
          MessageStatus: "delivered",
        }),
      }),
    ).resolves.toBe(false);
  });
});

test("provider adapters normalize successful and retryable responses", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACsynthetic");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "synthetic-token");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGsynthetic");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "practice@example.test");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sid: "SMsynthetic" }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 })),
  );

  await expect(
    sendSms({
      to: "+15550101001",
      body: "Appointment with the practice",
      callbackUrl: "https://example.test/twilio-status",
      correlationId: "synthetic-attempt",
    }),
  ).resolves.toEqual({ ok: true, providerMessageId: "SMsynthetic" });
  await expect(
    sendEmail({
      to: "synthetic@example.test",
      subject: "Appointment with the practice",
      text: "Appointment with the practice",
      html: "<p>Appointment with the practice</p>",
      correlationId: "synthetic-attempt",
    }),
  ).resolves.toEqual({
    ok: false,
    category: "transient",
    code: "http_503",
  });
});

test("scheduler materializes one consent-aware job across repeated runs", async () => {
  const tx = convexTest(schema, modules);
  const world = await seedSchedulingWorld(tx);
  const [patientId] = await seedPatients(tx);
  const admin = await seedUser(tx, ["administrator"], "communication_admin");
  const frontDesk = await seedUser(tx, ["frontDesk"], "communication_staff");
  const startAt = zonedTimeToUtc("2026-08-03", 10 * 60, TZ)!;
  const booked = await frontDesk.mutation(api.domains.appointments.book, {
    patientId: patientId!,
    appointmentTypeId: world.appointmentTypeId,
    providerId: world.providerId,
    startAt,
  });
  if (!booked.ok) throw new Error("fixture booking failed");
  await tx.run((ctx) =>
    ctx.db.insert("communicationPreferences", {
      patientId: patientId!,
      smsOptIn: true,
      emailOptIn: true,
      voiceOptIn: false,
      preferredChannel: "sms",
      createdAt: 0,
      updatedAt: 0,
    }),
  );
  const templateId = await admin.mutation(
    api.domains.communications.createTemplate,
    {
      name: "Appointment reminder",
      intent: "appointmentReminder",
      channel: "sms",
      body: "Your appointment is {{appointmentDate}} at {{appointmentTime}}. Call {{practicePhone}} with questions.",
    },
  );
  const [template] = await admin.query(
    api.domains.communications.listTemplates,
    {},
  );
  await admin.mutation(api.domains.communications.publishTemplate, {
    versionId: template!.versions[0]!._id,
  });
  await admin.mutation(api.domains.communications.createSchedule, {
    appointmentTypeId: world.appointmentTypeId,
    templateId,
    channel: "sms",
    intent: "appointmentReminder",
    minutesBefore: 1_440,
  });

  const now = zonedTimeToUtc("2026-08-01", 9 * 60, TZ)!;
  expect(
    await tx.mutation(internal.domains.communications.materializeReminderJobs, {
      now,
    }),
  ).toEqual({ created: 1 });
  expect(
    await tx.mutation(internal.domains.communications.materializeReminderJobs, {
      now,
    }),
  ).toEqual({ created: 0 });
  expect(
    await tx.run((ctx) => ctx.db.query("communicationJobs").collect()),
  ).toHaveLength(1);
});

test("communication APIs enforce capability and replay callbacks idempotently", async () => {
  const tx = convexTest(schema, modules);
  const patient = await seedUser(tx, ["patient"], "communication_patient");
  await expect(
    patient.mutation(api.domains.communications.createTemplate, {
      name: "No access",
      intent: "appointmentReminder",
      channel: "sms",
      body: "Appointment with the practice",
    }),
  ).rejects.toThrow("Not authorized");

  const result = await tx.mutation(
    internal.domains.communications.applyProviderEvent,
    {
      provider: "twilio",
      eventId: "synthetic-event",
      providerMessageId: "synthetic-message",
      state: "delivered",
    },
  );
  expect(result).toEqual({ replay: false, matched: false });
  expect(
    await tx.mutation(internal.domains.communications.applyProviderEvent, {
      provider: "twilio",
      eventId: "synthetic-event",
      providerMessageId: "synthetic-message",
      state: "delivered",
    }),
  ).toEqual({ replay: true, matched: false });
});
