import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useAuthConfigured } from "../../lib/auth";

interface DuplicateCandidate {
  _id: string;
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth: string;
  status: "active" | "archived";
}

const inputCls = "mt-1 w-full rounded border px-2 py-1";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      {label}
      {children}
    </label>
  );
}

export default function PatientCreatePage() {
  const configured = useAuthConfigured();
  return (
    <section>
      <h1 className="text-2xl font-semibold">New patient</h1>
      {configured ? (
        <CreateForm />
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          Authentication is not configured in this environment.
        </p>
      )}
    </section>
  );
}

function CreateForm() {
  const navigate = useNavigate();
  const createPatient = useMutation(api.domains.patients.createPatient);
  const [form, setForm] = useState({
    legalFirstName: "",
    legalLastName: "",
    preferredName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    smsOptIn: true,
    emailOptIn: true,
    voiceOptIn: false,
    preferredChannel: "sms" as "sms" | "email" | "voice",
  });
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Identity edits invalidate a previous duplicate acknowledgement.
    setDuplicates(null);
    setAcknowledged(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await createPatient({
        legalFirstName: form.legalFirstName,
        legalLastName: form.legalLastName,
        preferredName: form.preferredName || undefined,
        dateOfBirth: form.dateOfBirth,
        email: form.email || undefined,
        phone: form.phone || undefined,
        communicationPreference: {
          smsOptIn: form.smsOptIn,
          emailOptIn: form.emailOptIn,
          voiceOptIn: form.voiceOptIn,
          preferredChannel: form.preferredChannel,
        },
        acknowledgedDuplicates: acknowledged,
      });
      if (result.created) {
        navigate(`/app/patients/${result.patientId}`);
      } else {
        setDuplicates(result.duplicates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-6">
      <fieldset className="space-y-3 border p-4">
        <legend className="font-medium">Identity</legend>
        <Field label="Legal first name">
          <input
            required
            value={form.legalFirstName}
            onChange={(e) => set("legalFirstName", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Legal last name">
          <input
            required
            value={form.legalLastName}
            onChange={(e) => set("legalLastName", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Preferred name (optional)">
          <input
            value={form.preferredName}
            onChange={(e) => set("preferredName", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Date of birth">
          <input
            type="date"
            required
            value={form.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            className={inputCls}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 border p-4">
        <legend className="font-medium">Contact</legend>
        <Field label="Email (optional)">
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-2 border p-4 text-sm">
        <legend className="font-medium">Communication preferences</legend>
        {(
          [
            ["smsOptIn", "Text messages"],
            ["emailOptIn", "Email"],
            ["voiceOptIn", "Phone calls"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => set(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
        <Field label="Preferred channel">
          <select
            value={form.preferredChannel}
            onChange={(e) =>
              set(
                "preferredChannel",
                e.target.value as typeof form.preferredChannel,
              )
            }
            className={inputCls}
          >
            <option value="sms">Text message</option>
            <option value="email">Email</option>
            <option value="voice">Phone call</option>
          </select>
        </Field>
      </fieldset>

      {duplicates && duplicates.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 p-4 text-sm">
          <h2 className="font-medium">Possible duplicate records</h2>
          <ul className="mt-2 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d._id}>
                <Link to={`/app/patients/${d._id}`} className="underline">
                  {d.legalFirstName} {d.legalLastName}
                </Link>{" "}
                · DOB {d.dateOfBirth} · {d.status}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I reviewed these records and this is a different patient.
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          saving ||
          (duplicates !== null && duplicates.length > 0 && !acknowledged)
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create patient"}
      </button>
    </form>
  );
}
