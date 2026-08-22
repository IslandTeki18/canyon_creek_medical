import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import {
  AutosaveBanner,
  AutosaveStatus,
  useAutosave,
  useUnsavedGuard,
} from "../../src/features/administration/use-autosave";

afterEach(() => vi.useRealTimers());

function AutosaveHarness({
  value,
  save,
}: {
  value: string;
  save: (value: string) => Promise<unknown>;
}) {
  const autosave = useAutosave({ enabled: true, value, save });
  return (
    <>
      <output data-testid="autosave-state">
        {JSON.stringify({
          dirty: autosave.dirty,
          status: autosave.status,
          savingSince: autosave.savingSince,
          error: autosave.error,
        })}
      </output>
      <button
        type="button"
        onClick={() => void autosave.flushNow("structural")}
      >
        Save structural edit
      </button>
    </>
  );
}

function UnsavedGuardHarness({ dirty }: { dirty: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const guard = useUnsavedGuard(dirty);
  return (
    <>
      <output data-testid="location">
        {`${location.pathname}${location.search}`}
      </output>
      <button type="button" onClick={() => navigate("/?card=two")}>
        Switch card
      </button>
      <button type="button" onClick={() => navigate("/other")}>
        Leave page
      </button>
      {guard}
    </>
  );
}

test.each(["idle", "error"] as const)(
  "does not claim an autosave is saved while %s",
  (status) => {
    render(<AutosaveStatus savedAt={Date.now()} status={status} />);
    expect(screen.queryByText(/^Saved/)).toBeNull();
  },
);

test("keeps a rejected edit dirty without retrying the same value", async () => {
  vi.useFakeTimers();
  const attempts: string[] = [];
  const save = async (value: string) => {
    attempts.push(value);
    throw new Error("Rejected");
  };
  const { rerender } = render(<AutosaveHarness save={save} value="one" />);

  rerender(<AutosaveHarness save={save} value="two" />);
  expect(screen.getByTestId("autosave-state").textContent).toContain(
    '"dirty":true',
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(attempts).toEqual(["two"]);
  expect(screen.getByTestId("autosave-state").textContent).toContain(
    '"dirty":true',
  );
  expect(screen.getByTestId("autosave-state").textContent).toContain(
    '"status":"error"',
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(attempts).toEqual(["two"]);

  rerender(<AutosaveHarness save={save} value="three" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(attempts).toEqual(["two", "three"]);
});

test("saves once after one second without edits", async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => undefined);
  const { rerender } = render(<AutosaveHarness save={save} value="one" />);

  rerender(<AutosaveHarness save={save} value="two" />);
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(save).toHaveBeenCalledExactlyOnceWith("two");
});

test("flushes at ten seconds during continuous edits", async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => undefined);
  const { rerender } = render(<AutosaveHarness save={save} value="0" />);

  for (let second = 1; second <= 10; second += 1) {
    rerender(<AutosaveHarness save={save} value={String(second)} />);
    await act(async () => vi.advanceTimersByTimeAsync(900));
  }
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(save).toHaveBeenCalledExactlyOnceWith("10");
});

test("coalesces edits during a save into one trailing save", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  const resolvers: Array<() => void> = [];
  const save = (value: string) => {
    calls.push(value);
    return new Promise<void>((resolve) => resolvers.push(resolve));
  };
  const { rerender } = render(<AutosaveHarness save={save} value="one" />);

  rerender(<AutosaveHarness save={save} value="two" />);
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  rerender(<AutosaveHarness save={save} value="three" />);
  await act(async () => vi.advanceTimersByTimeAsync(500));
  rerender(<AutosaveHarness save={save} value="four" />);
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(calls).toEqual(["two"]);

  await act(async () => resolvers[0]?.());
  expect(calls).toEqual(["two", "four"]);
  await act(async () => resolvers[1]?.());
});

test("flushes a dirty value on unmount", () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => undefined);
  const { rerender, unmount } = render(
    <AutosaveHarness save={save} value="one" />,
  );

  rerender(<AutosaveHarness save={save} value="two" />);
  unmount();
  expect(save).toHaveBeenCalledExactlyOnceWith("two");
});

test("saves structural edits immediately", () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => undefined);
  render(<AutosaveHarness save={save} value="one" />);

  fireEvent.click(screen.getByRole("button", { name: "Save structural edit" }));
  expect(save).toHaveBeenCalledExactlyOnceWith("structural");
});

test("tracks when an in-flight save started", async () => {
  vi.useFakeTimers();
  let finishSave = () => undefined;
  const save = () =>
    new Promise<void>((resolve) => {
      finishSave = resolve;
    });
  const { rerender } = render(<AutosaveHarness save={save} value="one" />);

  rerender(<AutosaveHarness save={save} value="two" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(screen.getByTestId("autosave-state").textContent).toMatch(
    /"savingSince":\d+/,
  );

  await act(async () => finishSave());
  expect(screen.getByTestId("autosave-state").textContent).toContain(
    '"savingSince":null',
  );
});

test("shows the slow-save warning after five seconds", async () => {
  vi.useFakeTimers();
  const onCopy = vi.fn();
  render(
    <AutosaveBanner
      error={null}
      onCopy={onCopy}
      savingSince={Date.now()}
      status="saving"
    />,
  );

  expect(
    screen.queryByText(
      "Your changes aren't saving right now. We're still trying — please keep this page open.",
    ),
  ).toBeNull();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(
    screen.getByText(
      "Your changes aren't saving right now. We're still trying — please keep this page open.",
    ),
  ).toBeDefined();
});

test("offers page-text copying after a rejected save", () => {
  const onCopy = vi.fn();
  render(
    <AutosaveBanner
      error="Rejected"
      onCopy={onCopy}
      savingSince={null}
      status="error"
    />,
  );

  expect(
    screen.getByText(
      "Your changes couldn't be saved. Copy your text before leaving.",
    ),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Copy page text" }));
  expect(onCopy).toHaveBeenCalledOnce();
});

test("only confirms path-changing navigation when dirty", async () => {
  const router = createMemoryRouter(
    [
      { path: "/", element: <UnsavedGuardHarness dirty /> },
      { path: "/other", element: <p>Other page</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);

  fireEvent.click(screen.getByRole("button", { name: "Switch card" }));
  expect(screen.getByTestId("location").textContent).toBe("/?card=two");
  expect(
    screen.queryByText("Leave anyway — your recent changes will be lost"),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Leave page" }));
  expect(
    await screen.findByText("Leave anyway — your recent changes will be lost"),
  ).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.getByTestId("location").textContent).toBe("/?card=two");

  fireEvent.click(screen.getByRole("button", { name: "Leave page" }));
  fireEvent.click(await screen.findByRole("button", { name: "Leave anyway" }));
  expect(await screen.findByText("Other page")).toBeDefined();
});

test("prevents unloading while dirty", () => {
  const router = createMemoryRouter(
    [{ path: "/", element: <UnsavedGuardHarness dirty /> }],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);

  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
