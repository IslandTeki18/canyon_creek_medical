import { useState, type ReactNode } from "react";
import { slugify } from "../../../convex/lib/content";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

export function NameDialog<Id>({
  title,
  description = "Choose a title. The public path is created automatically.",
  nameLabel = "Title",
  pathPrefix,
  trigger,
  onCreate,
  onCreated,
  children,
}: {
  title: string;
  description?: string;
  nameLabel?: string;
  pathPrefix?: "/services/" | "/blog/";
  trigger: ReactNode;
  onCreate: (title: string) => Promise<Id>;
  onCreated: (id: Id) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const trimmedName = name.trim();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setError(null);
    }
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      onCreated(await onCreate(trimmedName));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <label className="mt-4 block text-sm">
          {nameLabel}
          <input
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full rounded border bg-card px-3 py-2"
          />
        </label>
        {children}
        {pathPrefix && (
          <p className="mt-2 text-sm text-muted-foreground">
            {pathPrefix}
            {slugify(trimmedName)}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={
              !(pathPrefix ? slugify(trimmedName) : trimmedName) || pending
            }
            onClick={() => void submit()}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
