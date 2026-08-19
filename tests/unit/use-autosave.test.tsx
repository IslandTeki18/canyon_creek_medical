import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  AutosaveBanner,
  AutosaveStatus,
  useAutosave,
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
    <output data-testid="autosave-state">
      {JSON.stringify({
        dirty: autosave.dirty,
        status: autosave.status,
        savingSince: autosave.savingSince,
        error: autosave.error,
      })}
    </output>
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
