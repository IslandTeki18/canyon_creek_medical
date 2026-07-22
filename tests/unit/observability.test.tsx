import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { logEvent } from "../../convex/lib/logger";
import { RouteError } from "../../src/components/app-shell";

test("logEvent emits one JSON line with identifiers and no extra fields", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  logEvent("error", "webhook.clerk.replay_rejected", {
    requestId: "req_1",
    correlationId: "evt_9",
  });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
    severity: "error",
    event: "webhook.clerk.replay_rejected",
    requestId: "req_1",
    correlationId: "evt_9",
  });
  spy.mockRestore();
});

test("logEvent routes info severity to console.log", () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  logEvent("info", "job.completed");
  expect(JSON.parse(spy.mock.calls[0][0] as string).severity).toBe("info");
  spy.mockRestore();
});

test("route error state shows a reference id and logs it without PHI", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const Boom = () => {
    throw new Error("synthetic failure");
  };
  render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: "/", element: <Boom />, errorElement: <RouteError /> }],
        { initialEntries: ["/"] },
      )}
    />,
  );
  const detail = await screen.findByText(/Reference: [0-9a-f]{8}/);
  const referenceId = /Reference: ([0-9a-f]{8})/.exec(detail.textContent!)![1];
  const logged = spy.mock.calls
    .map((call) => call[0])
    .filter((arg): arg is string => typeof arg === "string")
    .find((arg) => arg.includes("client.route_error"));
  expect(logged).toBeDefined();
  expect(JSON.parse(logged!)).toEqual({
    severity: "error",
    event: "client.route_error",
    referenceId,
  });
  spy.mockRestore();
});
