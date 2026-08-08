import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

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
  const queuedRef = useRef(false);
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

  const flushNow = useCallback((nextValue?: T) => {
    if (nextValue !== undefined) {
      valueRef.current = nextValue;
      baselineRef.current = nextValue;
      dirtyRef.current = true;
    }
    clearTimers();
    if (!enabledRef.current || !dirtyRef.current) return Promise.resolve();
    if (savingRef.current) {
      queuedRef.current = true;
      return Promise.resolve();
    }

    dirtyRef.current = false;
    savingRef.current = true;
    if (mountedRef.current) {
      setStatus("saving");
      setError(null);
    }
    const request = saveRef.current(valueRef.current);
    const settled = request
      .then(() => {
        if (mountedRef.current) {
          setStatus("saved");
          setLastSavedAt(Date.now());
        }
      })
      .catch((reason: unknown) => {
        if (mountedRef.current) {
          setStatus("error");
          setError(reason instanceof Error ? reason.message : "Could not save");
        }
      })
      .finally(() => {
        savingRef.current = false;
        if (queuedRef.current || dirtyRef.current) {
          queuedRef.current = false;
          dirtyRef.current = true;
          void flushNow();
        }
      });
    return settled;
  }, [clearTimers]);

  const reset = useCallback(
    (nextValue: T, flush = false) => {
      if (flush) void flushNow();
      else clearTimers();
      valueRef.current = nextValue;
      baselineRef.current = nextValue;
      dirtyRef.current = false;
      queuedRef.current = false;
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
