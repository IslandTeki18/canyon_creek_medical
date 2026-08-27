import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export default function CommunicationAdminPage() {
  return (
    <section>
      <h1 className="font-display text-3xl">Communication templates</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Neutral, versioned SMS and email reminders.
      </p>
      <TemplateEditor />
      <ReminderSchedules />
    </section>
  );
}

function TemplateEditor() {
  const templates = useQuery(api.domains.communications.listTemplates, {});
  const create = useMutation(api.domains.communications.createTemplate);
  const update = useMutation(api.domains.communications.updateDraft);
  const publish = useMutation(api.domains.communications.publishTemplate);
  const createDraft = useMutation(api.domains.communications.createDraft);
  const preview = useQuery(api.domains.communications.previewTemplate, {
    subject: "Appointment with {{practiceName}}",
    body: "Your appointment is {{appointmentDate}} at {{appointmentTime}}. Call {{practicePhone}} with questions.",
  });
  const [error, setError] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const selectedChannel = data.get("channel") as "sms" | "email";
    try {
      await create({
        name: String(data.get("name")),
        intent: String(data.get("intent")),
        channel: selectedChannel,
        subject:
          selectedChannel === "email"
            ? String(data.get("subject") || "")
            : undefined,
        body: String(data.get("body")),
      });
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <form
        onSubmit={onCreate}
        className="grid max-w-2xl gap-3 rounded-card bg-card p-6 shadow-card"
      >
        <h2 className="font-semibold">New template</h2>
        <label className="text-sm">
          Name
          <input
            name="name"
            required
            className="mt-1 block w-full rounded-full border px-3 py-1"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Intent
            <input
              name="intent"
              required
              defaultValue="appointmentReminder"
              className="mt-1 block w-full rounded-full border px-3 py-1"
            />
          </label>
          <label className="text-sm">
            Channel
            <select
              name="channel"
              className="mt-1 block w-full rounded-full border px-3 py-1"
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </label>
        </div>
        <label className="text-sm">
          Email subject (email only)
          <input
            name="subject"
            defaultValue="Appointment with {{practiceName}}"
            className="mt-1 block w-full rounded-full border px-3 py-1"
          />
        </label>
        <label className="text-sm">
          Body
          <textarea
            name="body"
            required
            rows={3}
            defaultValue="Your appointment is {{appointmentDate}} at {{appointmentTime}}. Call {{practicePhone}} with questions."
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Variables: {preview?.variables.join(", ") ?? "loading…"}
        </p>
        <button className="w-fit rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">
          Create draft
        </button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {templates === undefined ? (
        <p role="status">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates yet.</p>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const latest = template.versions[0];
            return (
              <article
                key={template._id}
                className="rounded-card border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{template.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {template.channel} · {template.intent} · version{" "}
                      {latest?.version ?? "—"} {latest?.status}
                    </p>
                  </div>
                  {latest?.status === "draft" ? (
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1 text-sm"
                      onClick={() =>
                        void publish({ versionId: latest._id }).catch((cause) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not publish",
                          ),
                        )
                      }
                    >
                      Publish
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1 text-sm"
                      onClick={() =>
                        void createDraft({ templateId: template._id })
                      }
                    >
                      New version
                    </button>
                  )}
                </div>
                {latest?.status === "draft" && (
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void update({
                        versionId: latest._id,
                        subject:
                          template.channel === "email"
                            ? String(data.get("subject"))
                            : undefined,
                        body: String(data.get("body")),
                      }).catch((cause) =>
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not save",
                        ),
                      );
                    }}
                  >
                    {template.channel === "email" && (
                      <input
                        name="subject"
                        aria-label="Subject"
                        defaultValue={latest.subject}
                        className="rounded-full border px-3 py-1 text-sm"
                      />
                    )}
                    <textarea
                      name="body"
                      aria-label="Body"
                      defaultValue={latest.body}
                      rows={3}
                      className="rounded border px-3 py-2 text-sm"
                    />
                    <button className="w-fit rounded-full border px-3 py-1 text-sm">
                      Save draft
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReminderSchedules() {
  const schedules = useQuery(api.domains.communications.listSchedules, {});
  const templates = useQuery(api.domains.communications.listTemplates, {});
  const appointmentTypes = useQuery(
    api.domains.scheduling.listAppointmentTypes,
    {},
  );
  const create = useMutation(api.domains.communications.createSchedule);
  const setActive = useMutation(api.domains.communications.setScheduleActive);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold">Reminder schedules</h2>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const template = templates?.find(
            (item) => item._id === data.get("templateId"),
          );
          if (!template) return;
          void create({
            appointmentTypeId: data.get(
              "appointmentTypeId",
            ) as Id<"appointmentTypes">,
            templateId: template._id,
            channel: template.channel,
            intent: data.get("intent") as
              "appointmentReminder" | "incompleteIntake",
            minutesBefore: Number(data.get("minutesBefore")),
          }).catch((cause) =>
            setError(
              cause instanceof Error ? cause.message : "Could not create",
            ),
          );
        }}
      >
        <label className="text-sm">
          Appointment type
          <select
            required
            name="appointmentTypeId"
            className="mt-1 block rounded-full border px-3 py-1"
          >
            <option value="">Select…</option>
            {appointmentTypes
              ?.filter((item) => item.status === "active")
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Template
          <select
            required
            name="templateId"
            className="mt-1 block rounded-full border px-3 py-1"
          >
            <option value="">Select…</option>
            {templates
              ?.filter((item) =>
                item.versions.some((version) => version.status === "published"),
              )
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name} ({item.channel})
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Intent
          <select
            name="intent"
            className="mt-1 block rounded-full border px-3 py-1"
          >
            <option value="appointmentReminder">Appointment reminder</option>
            <option value="incompleteIntake">Incomplete intake</option>
          </select>
        </label>
        <label className="text-sm">
          Minutes before
          <input
            required
            name="minutesBefore"
            type="number"
            min="0"
            defaultValue="1440"
            className="mt-1 block w-28 rounded-full border px-3 py-1"
          />
        </label>
        <button className="rounded-full border px-3 py-1.5 text-sm">
          Add schedule
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {schedules === undefined ? (
        <p role="status" className="mt-3">
          Loading schedules…
        </p>
      ) : schedules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No reminder schedules yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {schedules.map((schedule) => (
            <li
              key={schedule._id}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
            >
              <span>
                {schedule.appointmentTypeName} · {schedule.templateName} ·{" "}
                {schedule.minutesBefore} minutes before
              </span>
              <button
                type="button"
                className="rounded-full border px-3 py-1"
                onClick={() =>
                  void setActive({
                    scheduleId: schedule._id,
                    active: !schedule.active,
                  })
                }
              >
                {schedule.active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
