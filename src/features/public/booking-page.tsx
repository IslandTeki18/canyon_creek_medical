import { makeFunctionReference } from "convex/server";
import { useAction, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { KICKER, MarketingPage, WRAP } from "./marketing-chrome";

/** Public booking wizard. A successful submission persists a standalone
 * scheduling object and immediately holds the selected practice-wide time. */

const STEP_LABELS = ["Service", "Date & time", "Your details"] as const;
const PRACTICE_PHONE = "(555) 012-3456";

const FIELD_LABEL = "mb-1.5 block text-xs text-ink/70";
const INPUT =
  "w-full rounded-full border border-ink/15 bg-surface px-3.5 py-2 text-sm text-ink caret-primary hover:border-ink/45 focus-visible:border-primary focus-visible:outline-none";
const SELECT_ON = "border-2 border-primary";
const SELECT_OFF = "border-2 border-transparent";
const MUTED_LABEL =
  "mb-2.5 block text-xs font-semibold tracking-[0.06em] text-ink/70 uppercase";

interface Slot {
  startAt: number;
  endAt: number;
  date: string;
  localTime: string;
  timeZone: string;
}

const publicServices = makeFunctionReference<
  "query",
  Record<string, never>,
  Array<{ serviceId: Id<"services">; name: string }>
>("domains/bookings:publicServices");
const publicSlots = makeFunctionReference<
  "query",
  { fromDate: string; toDate: string },
  Slot[]
>("domains/bookings:publicSlots");
const requestBooking = makeFunctionReference<
  "action",
  {
    captchaToken: string;
    fullName: string;
    email?: string;
    phone?: string;
    serviceId: Id<"services">;
    startAt: number;
  },
  | { ok: true }
  | {
      ok: false;
      reason: "captcha" | "slotUnavailable" | "tooManyBookings";
    }
>("domains/bookings:requestBooking");

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: {
          sitekey: string;
          callback(token: string): void;
          "expired-callback"(): void;
          "error-callback"(): void;
        },
      ): string;
      reset(widgetId: string): void;
      remove(widgetId: string): void;
    };
  }
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(date: string): { dow: string; day: string; mon: string } {
  const value = new Date(`${date}T12:00:00`);
  return {
    dow: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(value),
    day: String(value.getDate()),
    mon: new Intl.DateTimeFormat("en-US", { month: "short" }).format(value),
  };
}

export default function BookingPage() {
  const range = useMemo(() => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return { fromDate: isoDate(start), toDate: isoDate(end) };
  }, []);
  const services = useQuery(publicServices, {});
  const slots = useQuery(publicSlots, range);
  const submitBooking = useAction(requestBooking);
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<Id<"services"> | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      grouped.set(slot.date, [...(grouped.get(slot.date) ?? []), slot]);
    }
    return grouped;
  }, [slots]);
  const dates = [...slotsByDate.keys()];
  const selectedService = services?.find(
    (service) => service.serviceId === serviceId,
  );
  const selectedSlot = slots?.find((slot) => slot.startAt === startAt);

  useEffect(() => {
    if (!siteKey || step !== 2) return;
    const render = () => {
      if (!window.turnstile || !captchaRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey,
        callback: setCaptchaToken,
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => setCaptchaToken(""),
      });
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    return () => {
      script.removeEventListener("load", render);
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, step]);

  function resetCaptcha() {
    setCaptchaToken("");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }

  async function handleSubmit() {
    if (!serviceId || startAt === null) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitBooking({
        captchaToken,
        fullName,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        serviceId,
        startAt,
      });
      if (result.ok) {
        setConfirmed(true);
      } else if (result.reason === "slotUnavailable") {
        setStartAt(null);
        setStep(1);
        setError("That time was just taken. Please choose another.");
      } else if (result.reason === "tooManyBookings") {
        setError(
          `You already have several upcoming visits. Please call ${PRACTICE_PHONE}.`,
        );
      } else {
        setError("We could not verify that you are human. Please try again.");
      }
      if (!result.ok) resetCaptcha();
    } catch {
      setError(`We could not book that time. Please call ${PRACTICE_PHONE}.`);
      resetCaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = [
    serviceId !== null,
    date !== null && startAt !== null,
    fullName.trim() !== "" &&
      (email.trim() !== "" || phone.trim() !== "") &&
      Boolean(siteKey && captchaToken),
  ][step];

  return (
    <MarketingPage>
      <header className={`${WRAP} pt-11 pb-6`}>
        <span className={`${KICKER} mb-3`}>Scheduling</span>
        <h1 className="m-0 font-display text-[clamp(32px,4vw,52px)] leading-[1.05]">
          Book an appointment
        </h1>
      </header>

      {confirmed ? (
        <div className={`${WRAP} pb-20`}>
          <div className="rounded-card bg-surface px-6 py-12 text-center shadow-card">
            <div className="mx-auto mb-5.5 grid size-19 place-items-center rounded-full bg-ground-deep text-teal">
              <Check size={34} strokeWidth={2.75} />
            </div>
            <h2 className="m-0 mb-2.5 font-display text-3xl">You're booked</h2>
            <p className="m-0 text-[15.5px] text-ink/80">
              {selectedService?.name} · {selectedSlot?.date} at{" "}
              {selectedSlot?.localTime}
            </p>
            <p className="mt-3 mb-6 text-sm text-ink/70">
              To change or cancel, call the practice at {PRACTICE_PHONE}.
            </p>
            <Link
              to="/"
              className="rounded-full bg-primary px-5.5 py-3 font-display text-sm text-white no-underline hover:bg-primary-deep"
            >
              Back to home
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className={`${WRAP} pb-7`}>
            <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
              {STEP_LABELS.map((label, index) => {
                const done = index < step;
                const current = index === step;
                return (
                  <li key={label} className="contents">
                    <div
                      className="flex items-center gap-2.5"
                      aria-current={current ? "step" : undefined}
                    >
                      <span
                        className={`grid size-7.5 flex-none place-items-center rounded-full border-[1.5px] text-[13px] font-semibold ${
                          current
                            ? "border-primary bg-primary text-white"
                            : done
                              ? "border-primary bg-primary-tint text-primary-deep"
                              : "border-ink/15 bg-transparent text-ink/70"
                        }`}
                      >
                        {done ? "✓" : index + 1}
                      </span>
                      <span
                        className={`hidden text-[13.5px] font-semibold sm:inline ${current ? "text-ink" : "text-ink/70"}`}
                      >
                        {label}
                      </span>
                    </div>
                    {index < STEP_LABELS.length - 1 && (
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
              {error && (
                <p
                  role="alert"
                  className="mb-5 rounded-2xl bg-primary-tint p-4 text-sm"
                >
                  {error}
                </p>
              )}

              {step === 0 && (
                <>
                  <h2 className="m-0 mb-1.5 font-display text-2xl">
                    Which service are you interested in?
                  </h2>
                  <p className="mt-0 mb-5.5 text-[14.5px] text-ink/70">
                    Choose the service that best fits your visit.
                  </p>
                  {services === undefined ? (
                    <p>Loading services…</p>
                  ) : services.length === 0 ? (
                    <p>No services are available right now.</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
                      {services.map((service) => (
                        <button
                          key={service.serviceId}
                          type="button"
                          onClick={() => setServiceId(service.serviceId)}
                          aria-pressed={serviceId === service.serviceId}
                          className={`cursor-pointer rounded-2xl bg-surface px-4.5 py-4 text-left font-display text-[17px] ${
                            serviceId === service.serviceId
                              ? SELECT_ON
                              : SELECT_OFF
                          }`}
                        >
                          {service.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="m-0 mb-1.5 font-display text-2xl">
                    Pick a date &amp; time
                  </h2>
                  <p className="mt-0 mb-5 text-[14.5px] text-ink/70">
                    Times are shown in the practice's local time zone.
                  </p>
                  {slots === undefined ? (
                    <p>Loading available times…</p>
                  ) : slots.length === 0 ? (
                    <p>
                      No times are available right now — call the practice at{" "}
                      {PRACTICE_PHONE}.
                    </p>
                  ) : (
                    <>
                      <span className={MUTED_LABEL}>Date</span>
                      <div className="mb-6 flex gap-2.5 overflow-x-auto pb-2">
                        {dates.map((value) => {
                          const label = dateLabel(value);
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setDate(value);
                                setStartAt(null);
                              }}
                              aria-pressed={date === value}
                              className={`flex min-w-[66px] flex-none cursor-pointer flex-col items-center gap-1 rounded-2xl bg-surface px-4 py-3 ${
                                date === value ? SELECT_ON : SELECT_OFF
                              }`}
                            >
                              <span className="text-[11px] tracking-[0.05em] text-ink/70 uppercase">
                                {label.dow}
                              </span>
                              <span className="font-display text-xl">
                                {label.day}
                              </span>
                              <span className="text-[11px] text-ink/70">
                                {label.mon}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <span className={MUTED_LABEL}>Available times</span>
                      {date ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
                          {slotsByDate.get(date)?.map((slot) => (
                            <button
                              key={slot.startAt}
                              type="button"
                              onClick={() => setStartAt(slot.startAt)}
                              aria-pressed={startAt === slot.startAt}
                              className={`cursor-pointer rounded-full bg-surface p-3 font-display text-sm ${
                                startAt === slot.startAt
                                  ? SELECT_ON
                                  : SELECT_OFF
                              }`}
                            >
                              {slot.localTime}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink/70">
                          Choose a date first.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="m-0 mb-5.5 font-display text-2xl">
                    Your details
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-full">
                      <label htmlFor="book-name" className={FIELD_LABEL}>
                        Full name
                      </label>
                      <input
                        id="book-name"
                        type="text"
                        required
                        maxLength={120}
                        className={INPUT}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        autoComplete="name"
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
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
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
                        onChange={(event) => setPhone(event.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                    <p className="col-span-full m-0 text-xs text-ink/70">
                      Enter at least one of email or phone.
                    </p>
                    {siteKey && (
                      <div ref={captchaRef} className="col-span-full" />
                    )}
                  </div>
                </>
              )}

              <div className="mt-8 flex justify-between gap-3 border-t border-ink/15 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep(step - 1);
                  }}
                  className={`cursor-pointer rounded-full border border-ink/15 bg-transparent px-4 py-2 font-display text-sm text-ink hover:bg-ink/7 ${
                    step === 0 ? "invisible" : ""
                  }`}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    if (step === 2) void handleSubmit();
                    else setStep(step + 1);
                  }}
                  disabled={!canContinue || submitting}
                  className="cursor-pointer rounded-full bg-primary px-4 py-2 font-display text-sm text-white hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {step === 2
                    ? submitting
                      ? "Booking…"
                      : "Book appointment"
                    : "Continue"}
                </button>
              </div>
            </main>

            <aside className="-order-1 md:sticky md:top-6 md:order-none">
              <div className="flex flex-col gap-4 rounded-card bg-surface p-6 shadow-card">
                <h3 className="m-0 font-display text-lg">Your appointment</h3>
                <dl className="m-0 flex flex-col gap-3">
                  {(
                    [
                      ["Service", selectedService?.name ?? "Not selected"],
                      [
                        "Date & time",
                        selectedSlot
                          ? `${selectedSlot.date} · ${selectedSlot.localTime}`
                          : "Not selected",
                      ],
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
              </div>
            </aside>
          </div>
        </>
      )}
    </MarketingPage>
  );
}
