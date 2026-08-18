import { useEffect } from "react";

// ponytail: single-slot toast; a new toast replaces the pending one. Queue only
// if a second caller ever needs it.
export type ToastState = {
  message: string;
  actionLabel: string;
  onAction: () => void;
};

const DISMISS_MS = 6000;

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border bg-card px-4 py-2 text-sm shadow-lg"
    >
      {toast.message}
      <button
        type="button"
        onClick={() => {
          toast.onAction();
          onDismiss();
        }}
        className="font-medium underline"
      >
        {toast.actionLabel}
      </button>
    </div>
  );
}
