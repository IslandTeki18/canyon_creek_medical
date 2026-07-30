// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedUser } from "../fixtures/forms";
import { seedReadySession } from "../fixtures/ketamine";

const modules = import.meta.glob("../../convex/**/*.ts");

test("board shows the day's sessions with neutral labels and blockers", async () => {
  const tx = convexTest(schema, modules);
  const { world, sessionId } = await seedReadySession(tx);
  // A second, incomplete session should surface its blockers.
  const blocked = await world.provider.mutation(
    api.domains.ketamine.createSession,
    { courseId: world.courseId },
  );
  const today = new Date().toISOString().slice(0, 10);
  const rows = await world.clinicalStaff.query(
    api.domains.ketamine.listDayBoard,
    { date: today },
  );
  const readyRow = rows.find((row) => row.sessionId === sessionId);
  const blockedRow = rows.find((row) => row.sessionId === blocked);
  expect(readyRow?.state).toBe("ready");
  expect(readyRow?.blockers).toEqual([]);
  expect(blockedRow?.state).toBe("planned");
  expect(blockedRow?.blockers.length).toBeGreaterThan(0);
  // Neutral operational labels only.
  for (const row of rows) {
    expect(JSON.stringify(row)).not.toMatch(/diagnos|ketamine dose|mg\b/i);
  }
});

test("board requires clinical.manage and validates the date", async () => {
  const tx = convexTest(schema, modules);
  const { world } = await seedReadySession(tx);
  const frontDesk = await seedUser(tx, ["frontDesk"], "ket_board_fd");
  await expect(
    frontDesk.query(api.domains.ketamine.listDayBoard, {
      date: "2026-08-03",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    world.clinicalStaff.query(api.domains.ketamine.listDayBoard, {
      date: "not-a-date",
    }),
  ).rejects.toThrow("Date must be YYYY-MM-DD");
});
