import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";

// 5.2 — locations, services, and appointment types. Provider working hours
// and time off live on the provider availability screen.

export default function SchedulingConfigPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Scheduling configuration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Locations, services, and appointment types.{" "}
        <Link to="/admin/scheduling/providers" className="underline">
          Provider hours and time off
        </Link>
      </p>
      {configured ? (
        <div className="mt-6 space-y-8">
          <LocationsSection />
          <ServicesSection />
          <AppointmentTypesSection />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

/** Shared form shell: heading, inline error, and consistent spacing. */
function Section({
  title,
  onSubmit,
  children,
  error,
  submitLabel,
  body,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  error: string | null;
  submitLabel: string;
  body: ReactNode;
}) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-3">
        {children}
        <button
          type="submit"
          className="rounded-full bg-primary hover:bg-primary-deep px-3 py-1.5 text-sm text-primary-foreground"
        >
          {submitLabel}
        </button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {body}
    </div>
  );
}

function useSubmit<T>(action: (args: T) => Promise<unknown>) {
  const [error, setError] = useState<string | null>(null);
  async function run(args: T, onDone?: () => void) {
    setError(null);
    try {
      await action(args);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }
  return { error, run, setError };
}

function LocationsSection() {
  const locations = useQuery(api.domains.scheduling.listLocations, {});
  const { error, run } = useSubmit(
    useMutation(api.domains.scheduling.createLocation),
  );
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("America/Denver");

  return (
    <Section
      title="Locations"
      error={error}
      submitLabel="Add location"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ name, timeZone }, () => setName(""));
      }}
      body={
        locations === undefined ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading locations…
          </p>
        ) : locations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No locations yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {locations.map((l) => (
              <li key={l._id}>
                {l.name} — {l.timeZone}{" "}
                <span className="text-muted-foreground">({l.status})</span>
              </li>
            ))}
          </ul>
        )
      }
    >
      <label className="text-sm">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-56 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Time zone (IANA)
        <input
          required
          value={timeZone}
          onChange={(e) => setTimeZone(e.target.value)}
          className="mt-1 block w-56 rounded-full border bg-card px-3 py-1"
        />
      </label>
    </Section>
  );
}

function ServicesSection() {
  const services = useQuery(api.domains.scheduling.listServices, {});
  const { error, run } = useSubmit(
    useMutation(api.domains.scheduling.createService),
  );
  const [key, setKey] = useState("");
  const [name, setName] = useState("");

  return (
    <Section
      title="Services"
      error={error}
      submitLabel="Add service"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ key, name }, () => {
          setKey("");
          setName("");
        });
      }}
      body={
        services === undefined ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading services…
          </p>
        ) : services.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No services yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {services.map((s) => (
              <li key={s._id}>
                {s.name}{" "}
                <span className="text-muted-foreground">({s.key})</span>
              </li>
            ))}
          </ul>
        )
      }
    >
      <label className="text-sm">
        Key
        <input
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-56 rounded-full border bg-card px-3 py-1"
        />
      </label>
    </Section>
  );
}

function AppointmentTypesSection() {
  const types = useQuery(api.domains.scheduling.listAppointmentTypes, {});
  const services = useQuery(api.domains.scheduling.listServices, {});
  const locations = useQuery(api.domains.scheduling.listLocations, {});
  const providers = useQuery(api.domains.scheduling.listProviders, {});
  const { error, run } = useSubmit(
    useMutation(api.domains.scheduling.createAppointmentType),
  );
  const archive = useMutation(api.domains.scheduling.setAppointmentTypeStatus);
  const [form, setForm] = useState({
    serviceId: "",
    locationId: "",
    key: "",
    name: "",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    providerId: "",
    patientSelfSchedulable: false,
  });

  const activeServices = (services ?? []).filter((s) => s.status === "active");
  const activeLocations = (locations ?? []).filter(
    (l) => l.status === "active",
  );
  const activeProviders = (providers ?? []).filter(
    (p) => p.status === "active",
  );

  return (
    <Section
      title="Appointment types"
      error={error}
      submitLabel="Add appointment type"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          {
            serviceId: form.serviceId as Id<"services">,
            locationId: form.locationId as Id<"locations">,
            key: form.key,
            name: form.name,
            durationMinutes: Number(form.durationMinutes),
            bufferBeforeMinutes: Number(form.bufferBeforeMinutes),
            bufferAfterMinutes: Number(form.bufferAfterMinutes),
            eligibleProviderIds: [form.providerId as Id<"providers">],
            patientSelfSchedulable: form.patientSelfSchedulable,
          },
          () => setForm({ ...form, key: "", name: "" }),
        );
      }}
      body={
        types === undefined ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Loading appointment types…
          </p>
        ) : types.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No appointment types yet.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Name</th>
                <th>Service</th>
                <th>Location</th>
                <th>Duration</th>
                <th>Buffers</th>
                <th>Providers</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t._id} className="border-b">
                  <td className="py-2">{t.name}</td>
                  <td>{t.serviceName}</td>
                  <td>{t.locationName}</td>
                  <td>{t.durationMinutes} min</td>
                  <td>
                    {t.bufferBeforeMinutes}/{t.bufferAfterMinutes}
                  </td>
                  <td>{t.providerNames.join(", ")}</td>
                  <td>{t.status}</td>
                  <td>
                    {t.status === "active" && (
                      <button
                        type="button"
                        className="rounded-full border bg-card px-3 py-1 text-xs"
                        onClick={() => {
                          const reason = window.prompt("Reason for archiving?");
                          if (reason) {
                            void archive({
                              appointmentTypeId: t._id,
                              status: "archived",
                              reason,
                            });
                          }
                        }}
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    >
      <label className="text-sm">
        Service
        <select
          required
          value={form.serviceId}
          onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        >
          <option value="">Select…</option>
          {activeServices.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Location
        <select
          required
          value={form.locationId}
          onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        >
          <option value="">Select…</option>
          {activeLocations.map((l) => (
            <option key={l._id} value={l._id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Provider
        <select
          required
          value={form.providerId}
          onChange={(e) => setForm({ ...form, providerId: e.target.value })}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        >
          <option value="">Select…</option>
          {activeProviders.map((p) => (
            <option key={p._id} value={p._id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Key
        <input
          required
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
          className="mt-1 block w-32 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 block w-40 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Duration (min)
        <input
          type="number"
          min={5}
          required
          value={form.durationMinutes}
          onChange={(e) =>
            setForm({ ...form, durationMinutes: Number(e.target.value) })
          }
          className="mt-1 block w-24 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Buffer before
        <input
          type="number"
          min={0}
          value={form.bufferBeforeMinutes}
          onChange={(e) =>
            setForm({ ...form, bufferBeforeMinutes: Number(e.target.value) })
          }
          className="mt-1 block w-24 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="text-sm">
        Buffer after
        <input
          type="number"
          min={0}
          value={form.bufferAfterMinutes}
          onChange={(e) =>
            setForm({ ...form, bufferAfterMinutes: Number(e.target.value) })
          }
          className="mt-1 block w-24 rounded-full border bg-card px-3 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.patientSelfSchedulable}
          onChange={(e) =>
            setForm({ ...form, patientSelfSchedulable: e.target.checked })
          }
        />
        Patient self-scheduling (deferred)
      </label>
    </Section>
  );
}
