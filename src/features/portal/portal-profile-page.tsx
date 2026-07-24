import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";

const inputCls = "mt-1 w-full rounded border px-2 py-1";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
    </label>
  );
}

/** Shared submit handling: saving/saved/error feedback, no data in logs. */
function useSave(action: () => Promise<unknown>) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    setMessage(null);
    try {
      await action();
      setState("saved");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not save");
    }
  }
  const feedback =
    state === "saved" ? (
      <p role="status" className="text-sm text-green-700">
        Saved.
      </p>
    ) : state === "error" ? (
      <p role="alert" className="text-sm text-red-700">
        {message}
      </p>
    ) : null;
  return { onSubmit, saving: state === "saving", feedback };
}

function SaveButton({ saving }: { saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

export default function PortalProfilePage() {
  const profile = useQuery(api.domains.portal.myProfile, {});
  if (profile === undefined) {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading your profile…
      </p>
    );
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Contact the practice to correct your legal name or date of birth.
      </p>
      <div className="mt-4 max-w-lg space-y-6">
        <IdentitySection profile={profile} />
        <AddressSection address={profile.address} />
        <EmergencyContactSection contact={profile.emergencyContact} />
        <CommunicationSection preference={profile.communicationPreference} />
        <PharmacySection pharmacy={profile.pharmacy} />
      </div>
    </section>
  );
}

type Profile = NonNullable<
  ReturnType<typeof useQuery<typeof api.domains.portal.myProfile>>
>;

function IdentitySection({ profile }: { profile: Profile }) {
  const update = useMutation(api.domains.portal.updateMyProfile);
  const [form, setForm] = useState({
    preferredName: profile.preferredName ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
  });
  const { onSubmit, saving, feedback } = useSave(() =>
    update({
      preferredName: form.preferredName,
      email: form.email || undefined,
      phone: form.phone,
    }),
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3 border p-4">
      <h2 className="font-medium">Contact information</h2>
      <p className="text-sm text-neutral-500">
        {profile.readOnly.legalFirstName} {profile.readOnly.legalLastName}, born{" "}
        {profile.readOnly.dateOfBirth}
      </p>
      <Field label="Preferred name">
        <input
          value={form.preferredName}
          onChange={(e) =>
            setForm((f) => ({ ...f, preferredName: e.target.value }))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className={inputCls}
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className={inputCls}
        />
      </Field>
      {feedback}
      <SaveButton saving={saving} />
    </form>
  );
}

function AddressSection({ address }: { address: Profile["address"] }) {
  const update = useMutation(api.domains.portal.updateMyAddress);
  const [form, setForm] = useState({
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    postalCode: address?.postalCode ?? "",
  });
  const { onSubmit, saving, feedback } = useSave(() =>
    update({ ...form, line2: form.line2 || undefined }),
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={onSubmit} className="space-y-3 border p-4">
      <h2 className="font-medium">Home address</h2>
      <Field label="Address line 1">
        <input
          required
          value={form.line1}
          onChange={set("line1")}
          className={inputCls}
        />
      </Field>
      <Field label="Address line 2 (optional)">
        <input
          value={form.line2}
          onChange={set("line2")}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="City">
          <input
            required
            value={form.city}
            onChange={set("city")}
            className={inputCls}
          />
        </Field>
        <Field label="State">
          <input
            required
            value={form.state}
            onChange={set("state")}
            className={inputCls}
          />
        </Field>
        <Field label="Postal code">
          <input
            required
            value={form.postalCode}
            onChange={set("postalCode")}
            className={inputCls}
          />
        </Field>
      </div>
      {feedback}
      <SaveButton saving={saving} />
    </form>
  );
}

function EmergencyContactSection({
  contact,
}: {
  contact: Profile["emergencyContact"];
}) {
  const update = useMutation(api.domains.portal.updateMyEmergencyContact);
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    relationship: contact?.relationship ?? "",
    phone: contact?.phone ?? "",
  });
  const { onSubmit, saving, feedback } = useSave(() => update(form));
  return (
    <form onSubmit={onSubmit} className="space-y-3 border p-4">
      <h2 className="font-medium">Emergency contact</h2>
      <Field label="Name">
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={inputCls}
        />
      </Field>
      <Field label="Relationship">
        <input
          required
          value={form.relationship}
          onChange={(e) =>
            setForm((f) => ({ ...f, relationship: e.target.value }))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Phone">
        <input
          required
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className={inputCls}
        />
      </Field>
      {feedback}
      <SaveButton saving={saving} />
    </form>
  );
}

function CommunicationSection({
  preference,
}: {
  preference: Profile["communicationPreference"];
}) {
  const update = useMutation(
    api.domains.portal.updateMyCommunicationPreferences,
  );
  const [form, setForm] = useState({
    smsOptIn: preference?.smsOptIn ?? true,
    emailOptIn: preference?.emailOptIn ?? true,
    voiceOptIn: preference?.voiceOptIn ?? false,
    preferredChannel: preference?.preferredChannel ?? ("sms" as const),
  });
  const { onSubmit, saving, feedback } = useSave(() => update(form));
  const toggle = (k: "smsOptIn" | "emailOptIn" | "voiceOptIn") => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={form[k]}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))}
      />
      {k === "smsOptIn"
        ? "Text messages"
        : k === "emailOptIn"
          ? "Email"
          : "Phone calls"}
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3 border p-4">
      <h2 className="font-medium">Communication preferences</h2>
      {toggle("smsOptIn")}
      {toggle("emailOptIn")}
      {toggle("voiceOptIn")}
      <Field label="Preferred channel">
        <select
          value={form.preferredChannel}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              preferredChannel: e.target.value as typeof f.preferredChannel,
            }))
          }
          className={inputCls}
        >
          <option value="sms">Text message</option>
          <option value="email">Email</option>
          <option value="voice">Phone call</option>
        </select>
      </Field>
      {feedback}
      <SaveButton saving={saving} />
    </form>
  );
}

function PharmacySection({ pharmacy }: { pharmacy: Profile["pharmacy"] }) {
  const update = useMutation(api.domains.portal.updateMyPharmacy);
  const [form, setForm] = useState({
    name: pharmacy?.name ?? "",
    phone: pharmacy?.phone ?? "",
    address: pharmacy?.address ?? "",
  });
  const { onSubmit, saving, feedback } = useSave(() =>
    update({
      name: form.name,
      phone: form.phone || undefined,
      address: form.address || undefined,
    }),
  );
  return (
    <form onSubmit={onSubmit} className="space-y-3 border p-4">
      <h2 className="font-medium">Preferred pharmacy</h2>
      <Field label="Pharmacy name">
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={inputCls}
        />
      </Field>
      <Field label="Phone (optional)">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className={inputCls}
        />
      </Field>
      <Field label="Address (optional)">
        <input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className={inputCls}
        />
      </Field>
      {feedback}
      <SaveButton saving={saving} />
    </form>
  );
}
