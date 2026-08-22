import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { ReasonDialog } from "../../components/ui/reason-dialog";

type ServiceStatus = "active" | "future" | "disabled";
type Migration = "keepExisting" | "cancelAffected";
type MigrationPrompt = {
  serviceId: Id<"services">;
  status: ServiceStatus;
  reason: string;
  message: string;
};

/** Service catalog and configuration workspace (12.1). */
export default function ServiceCatalogPage() {
  const catalog = useQuery(api.domains.administration.listServiceCatalog, {});
  const [selected, setSelected] = useState<Id<"services"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [migrationPrompt, setMigrationPrompt] =
    useState<MigrationPrompt | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const setStatus = useMutation(api.domains.administration.setServiceStatus);

  async function migrate(migration: Migration) {
    if (!migrationPrompt) return;
    setMigrationError(null);
    try {
      const { serviceId, status, reason } = migrationPrompt;
      const result = await setStatus({
        serviceId,
        status,
        reason,
        migration,
      });
      setNotice(
        `Service is now ${status}. ${result.cancelledAppointments} appointment(s) cancelled.`,
      );
      setMigrationPrompt(null);
    } catch (thrown) {
      setMigrationError(thrown instanceof Error ? thrown.message : "Failed");
    }
  }

  if (catalog === undefined) return <p role="status">Loading services…</p>;

  return (
    <section>
      <h1 className="font-display text-3xl">Bookable services</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Services, their appointment types, and the reminders, forms, resources,
        and providers each one depends on.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      )}

      {catalog.length === 0 ? (
        <p className="mt-4">
          No services configured yet. Add one from scheduling configuration.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Service</th>
              <th>Key</th>
              <th>Status</th>
              <th>Effective</th>
              <th>Appointment types</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((service) => (
              <tr key={service._id} className="border-b">
                <td className="py-2">{service.name}</td>
                <td>{service.key}</td>
                <td>{service.status}</td>
                <td>
                  {service.effectiveFrom
                    ? new Date(service.effectiveFrom).toLocaleDateString()
                    : "—"}
                  {" → "}
                  {service.effectiveTo
                    ? new Date(service.effectiveTo).toLocaleDateString()
                    : "—"}
                </td>
                <td>
                  {service.activeAppointmentTypeCount}/
                  {service.appointmentTypeCount} active
                </td>
                <td className="flex flex-wrap gap-2 py-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      setSelected(selected === service._id ? null : service._id)
                    }
                  >
                    {selected === service._id ? "Hide" : "Configuration"}
                  </button>
                  {(["active", "future", "disabled"] as const)
                    .filter((status) => status !== service.status)
                    .map((status) => (
                      <ReasonDialog
                        key={status}
                        title={`Mark ${service.name} ${status}?`}
                        confirmLabel={`Mark ${status}`}
                        confirmVariant={
                          status === "disabled" ? "destructive" : "default"
                        }
                        trigger={
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Mark {status}
                          </button>
                        }
                        onConfirm={async (reason) => {
                          setError(null);
                          setNotice(null);
                          try {
                            await setStatus({
                              serviceId: service._id,
                              status,
                              reason,
                            });
                            setNotice(`Service is now ${status}.`);
                          } catch (thrown) {
                            const message =
                              thrown instanceof Error
                                ? thrown.message
                                : "Failed";
                            if (!message.includes("choose a migration")) {
                              throw thrown;
                            }
                            setMigrationPrompt({
                              serviceId: service._id,
                              status,
                              reason,
                              message,
                            });
                          }
                        }}
                      />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <ServiceConfiguration serviceId={selected} />}

      <AlertDialog
        open={migrationPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMigrationPrompt(null);
            setMigrationError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Future appointments use this service
          </AlertDialogTitle>
          <AlertDialogDescription>
            {migrationPrompt?.message}. Choose what happens to them.
          </AlertDialogDescription>
          {migrationError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {migrationError}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Back</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="outline"
                onClick={(event) => {
                  event.preventDefault();
                  void migrate("keepExisting");
                }}
              >
                Keep them, stop new bookings
              </Button>
            </AlertDialogAction>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  void migrate("cancelAffected");
                }}
              >
                Cancel those appointments
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ServiceConfiguration({ serviceId }: { serviceId: Id<"services"> }) {
  const config = useQuery(api.domains.administration.getServiceConfiguration, {
    serviceId,
  });
  const update = useMutation(api.domains.administration.updateService);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (config === undefined) {
    return (
      <p role="status" className="mt-4 text-sm">
        Loading configuration…
      </p>
    );
  }
  return (
    <div className="mt-6 rounded-organic p-6 bg-card shadow-organic-sm">
      <h2 className="font-medium">{config.service.name}</h2>
      <form
        className="mt-3 flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          update({
            serviceId,
            name: config.service.name,
            effectiveFrom: from ? Date.parse(from) : undefined,
            effectiveTo: to ? Date.parse(to) : undefined,
          }).catch((e: Error) => setError(e.message));
        }}
      >
        <label htmlFor="effective-from">Effective from</label>
        <input
          id="effective-from"
          type="date"
          className="rounded border bg-card px-2 py-1"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <label htmlFor="effective-to">to</label>
        <input
          id="effective-to"
          type="date"
          className="rounded border bg-card px-2 py-1"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <button type="submit" className="rounded border px-3 py-1">
          Save window
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {config.appointmentTypes.length === 0 ? (
        <p className="mt-4 text-sm">No appointment types use this service.</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm">
          {config.appointmentTypes.map((type) => (
            <li key={type._id} className="rounded border p-3">
              <p className="font-medium">
                {type.name}{" "}
                <span className="text-muted-foreground">
                  ({type.status}, {type.durationMinutes} min,{" "}
                  {type.locationName})
                </span>
              </p>
              <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1">
                <dt className="text-muted-foreground">Providers</dt>
                <dd>{type.providerNames.join(", ") || "none"}</dd>
                <dt className="text-muted-foreground">Reminders</dt>
                <dd>
                  {type.reminders.length === 0
                    ? "none"
                    : type.reminders
                        .map(
                          (reminder) =>
                            `${reminder.templateName} (${reminder.channel}, ${reminder.minutesBefore} min before${
                              reminder.active ? "" : ", inactive"
                            })`,
                        )
                        .join("; ")}
                </dd>
                <dt className="text-muted-foreground">Forms</dt>
                <dd>
                  {type.forms.length === 0
                    ? "none"
                    : type.forms
                        .map(
                          (form) => `${form.templateName} (${form.audience})`,
                        )
                        .join("; ")}
                </dd>
                <dt className="text-muted-foreground">Resources</dt>
                <dd>
                  {type.resourceRequirements.length === 0
                    ? "none required"
                    : type.resourceRequirements
                        .map(
                          (requirement) =>
                            `${requirement.type}: ${requirement.availableCount} available`,
                        )
                        .join("; ")}
                </dd>
              </dl>
              {type.resourceRequirements.some(
                (requirement) => requirement.availableCount === 0,
              ) && (
                <p role="alert" className="mt-2 text-destructive">
                  A required resource type has no active resource at this
                  location — bookings will fail.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
