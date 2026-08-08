import { createElement, useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";
const relativeTime = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

export function AutosaveStatus({
  status,
  savedAt,
}: {
  status: Status;
  savedAt: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const elapsed = now - savedAt;
  const [amount, unit] =
    elapsed < 60_000
      ? [0, "second"]
      : elapsed < 3_600_000
        ? [-Math.floor(elapsed / 60_000), "minute"]
        : elapsed < 86_400_000
          ? [-Math.floor(elapsed / 3_600_000), "hour"]
          : [-Math.floor(elapsed / 86_400_000), "day"];
  return createElement(
    "p",
    { role: "status", className: "text-sm text-muted-foreground" },
    status === "saving"
      ? "Saving…"
      : `Saved ${elapsed < 60_000 ? "just now" : relativeTime.format(amount, unit as Intl.RelativeTimeFormatUnit)}`,
  );
}

export function useAutosave<T>({
  enabled,
  value,
  save,
}: {
  enabled: boolean;
  value: T;
  save: (value: T) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  const baselineRef = useRef(value);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef<{
    value: T;
    save: (value: T) => Promise<unknown>;
  } | null>(null);
  const runSaveRef = useRef<
    (job: { value: T; save: (value: T) => Promise<unknown> }) => void
  >(() => undefined);
  const idleRef = useRef<Promise<void> | null>(null);
  const resolveIdleRef = useRef<() => void>(() => undefined);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hardFlushRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  valueRef.current = value;
  saveRef.current = save;
  enabledRef.current = enabled;

  const clearTimers = useCallback(() => {
    clearTimeout(debounceRef.current);
    clearTimeout(hardFlushRef.current);
    debounceRef.current = undefined;
    hardFlushRef.current = undefined;
  }, []);

  const runSave = useCallback(
    (job: { value: T; save: (value: T) => Promise<unknown> }) => {
      if (!idleRef.current) {
        idleRef.current = new Promise((resolve) => {
          resolveIdleRef.current = resolve;
        });
      }
      savingRef.current = true;
      if (mountedRef.current) {
        setStatus("saving");
        setError(null);
      }
      void job
        .save(job.value)
        .then(() => {
          if (mountedRef.current) {
            setStatus("saved");
            setLastSavedAt(Date.now());
          }
        })
        .catch((reason: unknown) => {
          if (mountedRef.current) {
            setStatus("error");
            setError(
              reason instanceof Error ? reason.message : "Could not save",
            );
          }
        })
        .finally(() => {
          savingRef.current = false;
          const trailing = queuedRef.current;
          queuedRef.current = null;
          if (trailing) {
            runSaveRef.current(trailing);
          } else if (dirtyRef.current) {
            dirtyRef.current = false;
            runSaveRef.current({
              value: valueRef.current,
              save: saveRef.current,
            });
          } else {
            resolveIdleRef.current();
            idleRef.current = null;
          }
        });
    },
    [],
  );
  runSaveRef.current = runSave;

  const flushNow = useCallback(
    (nextValue?: T) => {
      if (nextValue !== undefined) {
        valueRef.current = nextValue;
        baselineRef.current = nextValue;
        dirtyRef.current = true;
      }
      clearTimers();
      if (!enabledRef.current || !dirtyRef.current) return Promise.resolve();
      const job = { value: valueRef.current, save: saveRef.current };
      dirtyRef.current = false;
      if (savingRef.current) {
        queuedRef.current = job;
        return idleRef.current ?? Promise.resolve();
      }
      runSave(job);
      return idleRef.current ?? Promise.resolve();
    },
    [clearTimers, runSave],
  );

  const reset = useCallback(
    (nextValue: T, flush = false) => {
      if (flush) void flushNow();
      else {
        clearTimers();
        queuedRef.current = null;
      }
      valueRef.current = nextValue;
      baselineRef.current = nextValue;
      dirtyRef.current = false;
      if (mountedRef.current) {
        setStatus("idle");
        setLastSavedAt(null);
        setError(null);
      }
    },
    [clearTimers, flushNow],
  );

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      dirtyRef.current = false;
      return;
    }
    if (Object.is(baselineRef.current, value)) return;
    baselineRef.current = value;
    dirtyRef.current = true;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flushNow(), 1_000);
    hardFlushRef.current ??= setTimeout(() => void flushNow(), 10_000);
  }, [clearTimers, enabled, flushNow, value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // ponytail: retry/backoff and navigation blocking belong to ticket 08.
      void flushNow();
    };
  }, [flushNow]);

  return { status, lastSavedAt, error, flushNow, reset };
}
