import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { KICKER, MarketingPage, WRAP } from "./marketing-chrome";

/**
 * Public booking-request wizard. Patient self-scheduling is deferred, so this
 * collects a request only — nothing is persisted or reserved; staff confirm by
 * phone or email. The design's disclaimer makes that explicit to the visitor.
 */

const SERVICES: ReadonlyArray<{ id: string; title: string; desc: string }> = [
  {
    id: "mh",
    title: "Mental Health Care",
    desc: "Evaluation & treatment for psychiatric conditions.",
  },
  {
    id: "med",
    title: "Medication Management",
    desc: "Ongoing medication review & optimization.",
  },
  {
    id: "addiction",
    title: "Addiction Medicine",
    desc: "Treatment for substance use disorders.",
  },
  {
    id: "mat",
    title: "Medication-Assisted Treatment",
    desc: "Suboxone, Sublocade, Vivitrol & support.",
  },
  {
    id: "ketamine",
    title: "Ketamine Therapy",
    desc: "For treatment-resistant conditions.",
  },
  {
    id: "general",
    title: "General consultation",
    desc: "Not sure? We'll point you the right way.",
  },
];

const PROVIDERS: ReadonlyArray<{ id: string; name: string; role: string }> = [
  {
    id: "owner",
    name: "Dr. [Owner Name]",
    role: "Psychiatry & Addiction Medicine",
  },
  { id: "provider2", name: "[Team Provider]", role: "Psychiatric Provider" },
  { id: "any", name: "First available", role: "Matched to your service" },
];

const TIME_SLOTS = [
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
] as const;

const STEP_LABELS = [
  "Service",
  "Provider",
  "Date & time",
  "Your details",
  "Confirm",
] as const;

interface DateOption {
  idx: number;
  dow: string;
  day: string;
  mon: string;
  full: string;
}

/** Next 7 weekdays, starting tomorrow, in the visitor's local time zone. */
function buildDates(now = new Date()): DateOption[] {
  const dowFmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const monFmt = new Intl.DateTimeFormat("en-US", { month: "short" });
  const out: DateOption[] = [];
  for (let i = 1; out.length < 7 && i <= 11; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dow = dowFmt.format(d);
    const mon = monFmt.format(d);
    out.push({
      idx: out.length,
      dow,
      day: String(d.getDate()),
      mon,
      full: `${dow}, ${mon} ${d.getDate()}`,
    });
  }
  return out;
}

const FIELD_LABEL = "mb-1.5 block text-xs text-ink/70";
const INPUT =
  "w-full rounded-full border border-ink/15 bg-sand-deep px-3.5 py-2 text-sm text-ink caret-clay hover:border-ink/45 focus-visible:border-clay focus-visible:outline-none";
const SELECT_ON = "border-2 border-clay";
const SELECT_OFF = "border-2 border-transparent";
const MUTED_LABEL =
  "mb-2.5 block text-xs font-semibold tracking-[0.06em] text-ink/70 uppercase";
const SEG =
  "cursor-pointer rounded-full border-[1.5px] px-4.5 py-2.5 font-display text-sm";

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [service, setService] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [dateIdx, setDateIdx] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [patientType, setPatientType] = useState<"new" | "returning">("new");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const dates = useMemo(() => buildDates(), []);

  const canContinue = [
    service !== null,
    provider !== null,
    dateIdx !== null && time !== null,
    firstName.trim() !== "" && email.trim() !== "",
    true,
  ][step];

  const summaryService =
    SERVICES.find((s) => s.id === service)?.title ?? "Not selected";
  const summaryProvider =
    PROVIDERS.find((p) => p.id === provider)?.name ?? "Not selected";
  const selectedDate = dates.find((d) => d.idx === dateIdx);
  const summaryWhen =
    selectedDate && time ? `${selectedDate.full} · ${time}` : "Not selected";

  return (
    <MarketingPage>
      <header className={`${WRAP} pt-11 pb-6`}>
        <span className={`${KICKER} mb-3`}>Scheduling</span>
        <h1 className="m-0 font-display text-[clamp(32px,4vw,52px)] leading-[1.05]">
          Book an appointment
        </h1>
      </header>

      {/* Stepper */}
      <div className={`${WRAP} pb-7`}>
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
          {STEP_LABELS.map((label, i) => {
            const done = i < step;
            const cur = i === step;
            return (
              <li key={label} className="contents">
                <div
                  className="flex items-center gap-2.5"
                  aria-current={cur ? "step" : undefined}
                >
                  <span
                    className={`grid size-7.5 flex-none place-items-center rounded-full border-[1.5px] text-[13px] font-semibold ${
                      cur
                        ? "border-clay bg-clay text-sand"
                        : done
                          ? "border-clay bg-clay-100 text-clay-700"
                          : "border-ink/15 bg-transparent text-ink/70"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`hidden text-[13.5px] font-semibold sm:inline ${cur ? "text-ink" : "text-ink/70"}`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="h-px min-w-3.5 flex-1 bg-ink/15"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div
        className={`${WRAP} grid items-start gap-[clamp(28px,4vw,48px)] pb-20 md:grid-cols-[minmax(0,1fr)_300px]`}
      >
        <main>
          {step === 0 && (
            <>
              <h2 className="m-0 mb-1.5 font-display text-2xl">
                Which service are you interested in?
              </h2>
              <p className="mt-0 mb-5.5 text-[14.5px] text-ink/70">
                Not sure? Choose "General consultation" and we'll guide you.
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
                {SERVICES.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => setService(svc.id)}
                    aria-pressed={service === svc.id}
                    className={`flex cursor-pointer flex-col gap-1 rounded-2xl bg-sand-deep px-4.5 py-4 text-left ${
                      service === svc.id ? SELECT_ON : SELECT_OFF
                    }`}
                  >
                    <span className="font-display text-[17px]">
                      {svc.title}
                    </span>
                    <span className="text-[13px] leading-normal text-ink/70">
                      {svc.desc}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="m-0 mb-1.5 font-display text-2xl">
                Choose a provider
              </h2>
              <p className="mt-0 mb-5.5 text-[14.5px] text-ink/70">
                Pick a specific clinician, or let us match you with the first
                available.
              </p>
              <div className="flex flex-col gap-3">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    aria-pressed={provider === p.id}
                    className={`flex w-full cursor-pointer items-center gap-4 rounded-2xl bg-sand-deep px-4.5 py-4 ${
                      provider === p.id ? SELECT_ON : SELECT_OFF
                    }`}
                  >
                    <span className="size-11 flex-none rounded-full bg-sage-200" />
                    <span className="flex flex-col gap-0.5 text-left">
                      <span className="font-display text-[17px]">{p.name}</span>
                      <span className="text-[13px] text-ink/70">{p.role}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="m-0 mb-1.5 font-display text-2xl">
                Pick a date &amp; time
              </h2>
              <p className="mt-0 mb-5 text-[14.5px] text-ink/70">
                All times shown in your local time zone.
              </p>
              <span className={MUTED_LABEL}>Date</span>
              <div className="mb-6 flex gap-2.5 overflow-x-auto pb-2">
                {dates.map((d) => (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => setDateIdx(d.idx)}
                    aria-pressed={dateIdx === d.idx}
                    className={`flex min-w-[66px] flex-none cursor-pointer flex-col items-center gap-1 rounded-2xl bg-sand-deep px-4 py-3 ${
                      dateIdx === d.idx ? SELECT_ON : SELECT_OFF
                    }`}
                  >
                    <span className="text-[11px] tracking-[0.05em] text-ink/70 uppercase">
                      {d.dow}
                    </span>
                    <span className="font-display text-xl">{d.day}</span>
                    <span className="text-[11px] text-ink/70">{d.mon}</span>
                  </button>
                ))}
              </div>
              <span className={MUTED_LABEL}>Available times</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
                {TIME_SLOTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    aria-pressed={time === t}
                    className={`cursor-pointer rounded-full bg-sand-deep p-3 font-display text-sm ${
                      time === t ? SELECT_ON : SELECT_OFF
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="m-0 mb-5.5 font-display text-2xl">Your details</h2>
              <div className="mb-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setPatientType("new")}
                  aria-pressed={patientType === "new"}
                  className={`${SEG} ${
                    patientType === "new"
                      ? "border-clay bg-clay text-sand"
                      : "border-ink/15 bg-transparent"
                  }`}
                >
                  New patient
                </button>
                <button
                  type="button"
                  onClick={() => setPatientType("returning")}
                  aria-pressed={patientType === "returning"}
                  className={`${SEG} ${
                    patientType === "returning"
                      ? "border-clay bg-clay text-sand"
                      : "border-ink/15 bg-transparent"
                  }`}
                >
                  Returning patient
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="book-first" className={FIELD_LABEL}>
                    First name
                  </label>
                  <input
                    id="book-first"
                    type="text"
                    className={INPUT}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label htmlFor="book-last" className={FIELD_LABEL}>
                    Last name
                  </label>
                  <input
                    id="book-last"
                    type="text"
                    className={INPUT}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <label htmlFor="book-email" className={FIELD_LABEL}>
                    Email
                  </label>
                  <input
                    id="book-email"
                    type="email"
                    className={INPUT}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="book-phone" className={FIELD_LABEL}>
                    Phone
                  </label>
                  <input
                    id="book-phone"
                    type="tel"
                    className={INPUT}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                  />
                </div>
                <div className="col-span-full">
                  <label htmlFor="book-reason" className={FIELD_LABEL}>
                    What brings you in? (optional)
                  </label>
                  <textarea
                    id="book-reason"
                    className={`${INPUT} min-h-[90px] resize-y rounded-2xl`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="A sentence or two helps us prepare."
                  />
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="pt-6 pb-2 text-center">
              <div className="mx-auto mb-5.5 grid size-19 place-items-center rounded-full bg-sage-200 text-sage-800">
                <Check size={34} strokeWidth={2.75} />
              </div>
              <h2 className="m-0 mb-2.5 font-display text-3xl">
                Request received
              </h2>
              <p className="mx-auto my-0 max-w-[44ch] text-[15.5px] leading-[1.65] text-ink/80">
                Thank you, {firstName.trim() || "and see you soon"}. We've
                received your appointment request and our team will reach out
                shortly to confirm. A summary is on this page.
              </p>
              <div className="mt-6.5 flex flex-wrap justify-center gap-3">
                <Link
                  to="/portal"
                  className="rounded-full bg-clay px-5.5 py-3 font-display text-sm text-sand no-underline hover:bg-clay-600"
                >
                  Go to patient portal
                </Link>
                <Link
                  to="/"
                  className="rounded-full border border-ink/15 px-5.5 py-3 font-display text-sm text-ink no-underline hover:bg-ink/7"
                >
                  Back to home
                </Link>
              </div>
            </div>
          )}

          {step < 4 && (
            <div className="mt-8 flex justify-between gap-3 border-t border-ink/15 pt-6">
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className={`cursor-pointer rounded-full border border-ink/15 bg-transparent px-4 py-2 font-display text-sm text-ink hover:bg-ink/7 ${
                  step === 0 ? "invisible" : ""
                }`}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
                className="cursor-pointer rounded-full bg-clay px-4 py-2 font-display text-sm text-sand hover:bg-clay-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {step === 3 ? "Confirm request" : "Continue"}
              </button>
            </div>
          )}
        </main>

        <aside className="-order-1 md:sticky md:top-6 md:order-none">
          <div className="flex flex-col gap-4 rounded-organic bg-sand-deep p-6 shadow-organic-sm">
            <h3 className="m-0 font-display text-lg">Your appointment</h3>
            <dl className="m-0 flex flex-col gap-3">
              {(
                [
                  ["Service", summaryService],
                  ["Provider", summaryProvider],
                  ["Date & time", summaryWhen],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink/70 uppercase">
                    {label}
                  </dt>
                  <dd className="m-0 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink/70">
              Booking a request doesn't finalize your appointment — we'll
              confirm by phone or email.
            </p>
          </div>
        </aside>
      </div>
    </MarketingPage>
  );
}
