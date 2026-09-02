import { makeFunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthConfigured } from "../../lib/auth";
import { FeatureGate } from "../../lib/features";

interface PracticeHour {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

interface BookingSettings {
  slotMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
}

const listPracticeHours = makeFunctionReference<
  "query",
  Record<string, never>,
  Array<PracticeHour & { _id: Id<"practiceHours"> }>
>("domains/bookings:listPracticeHours");
const setPracticeHours = makeFunctionReference<
  "mutation",
  { hours: PracticeHour[]; reason: string },
  null
>("domains/bookings:setPracticeHours");
const getBookingSettings = makeFunctionReference<
  "query",
  Record<string, never>,
  BookingSettings
>("domains/bookings:getBookingSettings");
const setBookingSettings = makeFunctionReference<
  "mutation",
  {
    slotMinutes: number;
    leadTimeHours: number;
    horizonDays: number;
    reason: string;
  },
  null
>("domains/bookings:setBookingSettings");

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function minuteToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinute(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export default function SchedulingConfigPage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="font-display text-3xl">Scheduling configuration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Practice-wide booking hours, settings, and locations.
      </p>
      {configured ? (
        <div className="mt-6 space-y-8">
          <PracticeHoursSection />
          <BookingSettingsSection />
          <LocationsSection />
          <FeatureGate flag="scheduling">
            <ServicesSection />
            <AppointmentTypesSection />
          </FeatureGate>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function PracticeHoursSection() {
  const stored = useQuery(listPracticeHours, {});
  const save = useMutation(setPracticeHours);
  const { error, run } = useSubmit(save);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(
    WEEKDAYS.map((_, weekday) => ({
      weekday,
      active: false,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  );

  useEffect(() => {
    if (!stored) return;
    setHours(
      WEEKDAYS.map((_, weekday) => {
        const hour = stored.find((row) => row.weekday === weekday);
        return {
          weekday,
          active: Boolean(hour),
          startMinute: hour?.startMinute ?? 9 * 60,
          endMinute: hour?.endMinute ?? 17 * 60,
        };
      }),
    );
  }, [stored]);

  return (
    <Section
      title="Practice hours"
      error={error}
      submitLabel="Save hours"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          {
            hours: hours
              .filter((hour) => hour.active)
              .map(({ weekday, startMinute, endMinute }) => ({
                weekday,
                startMinute,
                endMinute,
              })),
            reason,
          },
          () => setReason(""),
        );
      }}
      body={null}
    >
      <div className="w-full space-y-2">
        {hours.map((hour, index) => (
          <div key={hour.weekday} className="flex flex-wrap items-center gap-3">
            <label className="flex w-32 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hour.active}
                onChange={(event) => {
                  const next = [...hours];
                  next[index] = { ...hour, active: event.target.checked };
                  setHours(next);
                }}
              />
              {WEEKDAYS[hour.weekday]}
            </label>
            <input
              aria-label={`${WEEKDAYS[hour.weekday]} start`}
              type="time"
              disabled={!hour.active}
              value={minuteToTime(hour.startMinute)}
              onChange={(event) => {
                const next = [...hours];
                next[index] = {
                  ...hour,
                  startMinute: timeToMinute(event.target.value),
                };
                setHours(next);
              }}
              className="rounded-full border bg-card px-3 py-1 text-sm"
            />
            <span className="text-sm">to</span>
            <input
              aria-label={`${WEEKDAYS[hour.weekday]} end`}
              type="time"
              disabled={!hour.active}
              value={minuteToTime(hour.endMinute)}
              onChange={(event) => {
                const next = [...hours];
                next[index] = {
                  ...hour,
                  endMinute: timeToMinute(event.target.value),
                };
                setHours(next);
              }}
              className="rounded-full border bg-card px-3 py-1 text-sm"
            />
          </div>
        ))}
      </div>
      <label className="text-sm">
        Reason
        <input
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 block w-64 rounded-full border bg-card px-3 py-1"
        />
      </label>
    </Section>
  );
}

function BookingSettingsSection() {
  const stored = useQuery(getBookingSettings, {});
  const save = useMutation(setBookingSettings);
  const { error, run } = useSubmit(save);
  const [settings, setSettings] = useState<BookingSettings>({
    slotMinutes: 60,
    leadTimeHours: 24,
    horizonDays: 60,
  });
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (stored) setSettings(stored);
  }, [stored]);

  return (
    <Section
      title="Booking settings"
      error={error}
      submitLabel="Save settings"
      onSubmit={(event) => {
        event.preventDefault();
        void run({ ...settings, reason }, () => setReason(""));
      }}
      body={null}
    >
      {(
        [
          ["Slot length (minutes)", "slotMinutes", 1],
          ["Lead time (hours)", "leadTimeHours", 0],
          ["Booking horizon (days)", "horizonDays", 1],
        ] as const
      ).map(([label, key, min]) => (
        <label key={key} className="text-sm">
          {label}
          <input
            type="number"
            min={min}
            required
            value={settings[key]}
            onChange={(event) =>
              setSettings({ ...settings, [key]: Number(event.target.value) })
            }
            className="mt-1 block w-36 rounded-full border bg-card px-3 py-1"
          />
        </label>
      ))}
      <label className="text-sm">
        Reason
        <input
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 block w-64 rounded-full border bg-card px-3 py-1"
        />
      </label>
    </Section>
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
