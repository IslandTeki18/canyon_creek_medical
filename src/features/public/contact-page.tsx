import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { LifeBuoy, Mail, MapPin, Phone } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  IconTile,
  KICKER,
  MarketingPage,
  PRACTICE_CONTACT,
  WRAP,
} from "./marketing-chrome";

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: {
          sitekey: string;
          size: "flexible";
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

function useTurnstile(active: boolean) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!siteKey || !active) return;
    const render = () => {
      if (!window.turnstile || !captchaRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey,
        size: "flexible",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
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
  }, [siteKey, active]);
  return {
    siteKey,
    captchaRef,
    token,
    reset() {
      setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    },
  };
}

const INPUT =
  "min-h-[44px] w-full min-w-0 border-[1.5px] border-ink/14 bg-field px-5 py-3.5 text-[14.5px] text-ink caret-primary focus-visible:border-primary focus-visible:outline-none";
const fields = [
  {
    name: "name",
    label: "Full name",
    type: "text",
    autoComplete: "name",
    maxLength: 120,
    required: true,
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
    maxLength: 254,
    required: true,
  },
  {
    name: "phone",
    label: "Phone (optional)",
    type: "tel",
    autoComplete: "tel",
    maxLength: 40,
    required: false,
  },
  { name: "message", label: "Message", required: true },
] as const;
const phoneHref = `tel:${PRACTICE_CONTACT.phone.replace(/[^+\d]/g, "")}`;

export default function ContactPage() {
  const submitInquiry = useAction(api.domains.contact.submitInquiry);
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const captcha = useTurnstile(state !== "success");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim() || undefined,
      message: String(data.get("message") ?? "").trim(),
      website: String(data.get("website") ?? ""),
    };
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !values[field.name])
        nextErrors[field.name] = `${field.label} is required.`;
    }
    setErrors(nextErrors);
    setIssues([]);
    if (Object.keys(nextErrors).length) {
      setState("idle");
      (
        form.elements.namedItem(Object.keys(nextErrors)[0]!) as HTMLElement
      )?.focus();
      return;
    }
    setState("submitting");
    try {
      const result = await submitInquiry({
        ...values,
        captchaToken: captcha.token,
      });
      if (!result.ok) throw new Error("Submission failed");
      setState("success");
    } catch (error) {
      if (
        error instanceof ConvexError &&
        error.data &&
        typeof error.data === "object"
      ) {
        const detail = error.data as {
          code?: string;
          issues?: { message: string }[];
        };
        if (detail.code === "INVALID_INQUIRY" && Array.isArray(detail.issues))
          setIssues(detail.issues.map((issue) => issue.message));
      }
      setState("error");
      captcha.reset();
    }
  }

  return (
    <MarketingPage>
      <header className={`${WRAP} flex flex-col gap-4 pt-14 pb-10`}>
        <span className={KICKER}>Contact</span>
        <h1 className="text-[clamp(38px,5vw,66px)] leading-[1.06] font-extrabold tracking-[-0.03em] text-pretty">
          Get in touch
        </h1>
        <p className="max-w-[60ch] text-lg leading-[1.7] text-pretty text-ink/80">
          Send us a note and we will reply by phone or email on the next
          business day.
        </p>
      </header>
      <div
        className={`${WRAP} flex flex-wrap items-start gap-[clamp(32px,5vw,72px)] pb-16`}
      >
        <div className="min-w-0 flex-[1_1_440px] rounded-card bg-white p-[clamp(26px,3vw,44px)] shadow-card">
          {state === "success" ? (
            <div role="status" className="flex flex-col items-start gap-5">
              <h2 className="text-2xl font-bold">Message sent</h2>
              <p>We will be in touch within one business day.</p>
              <Link to="/" className={CTA_SECONDARY}>
                Back to home
              </Link>
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="flex flex-col gap-4">
              {fields.map((field) => (
                <div key={field.name} className="flex flex-col gap-2">
                  <label
                    htmlFor={`contact-${field.name}`}
                    className="text-sm font-semibold"
                  >
                    {field.label}
                  </label>
                  {field.name === "message" ? (
                    <textarea
                      id="contact-message"
                      name="message"
                      required
                      rows={6}
                      maxLength={2000}
                      className={`${INPUT} rounded-[18px]`}
                      aria-invalid={!!errors.message}
                      aria-describedby={`message-help${errors.message ? " message-error" : ""}`}
                    />
                  ) : (
                    <input
                      id={`contact-${field.name}`}
                      name={field.name}
                      type={field.type}
                      autoComplete={field.autoComplete}
                      maxLength={field.maxLength}
                      required={field.required}
                      className={`${INPUT} rounded-full`}
                      aria-invalid={!!errors[field.name]}
                      aria-describedby={
                        errors[field.name] ? `${field.name}-error` : undefined
                      }
                    />
                  )}
                  {field.name === "message" && (
                    <p
                      id="message-help"
                      className="text-sm leading-relaxed text-ink/60"
                    >
                      Please do not include medical history or medication
                      details here. We will ask what we need when we call you.
                    </p>
                  )}
                  {errors[field.name] && (
                    <p
                      id={`${field.name}-error`}
                      className="text-sm text-alert"
                    >
                      {errors[field.name]}
                    </p>
                  )}
                </div>
              ))}
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              {captcha.siteKey && <div ref={captcha.captchaRef} />}
              {state === "error" && (
                <p role="alert" className="text-sm text-alert">
                  {issues.length ? (
                    issues.join("; ")
                  ) : (
                    <>
                      We could not send your message. Please call us instead:{" "}
                      <a href={phoneHref}>{PRACTICE_CONTACT.phone}</a>.
                    </>
                  )}
                </p>
              )}
              <button
                type="submit"
                disabled={state === "submitting"}
                className={`${CTA_PRIMARY} self-start disabled:opacity-60`}
              >
                {state === "submitting" ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <img
            src="/images/clinic-interior.jpg"
            alt="Inside the Canyon Creek office"
            loading="lazy"
            className="aspect-[4/3] w-full rounded-[28px] object-cover"
          />
          {[
            {
              icon: MapPin,
              label: "Address",
              value: PRACTICE_CONTACT.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              )),
            },
            {
              icon: Phone,
              label: "Phone",
              value: <a href={phoneHref}>{PRACTICE_CONTACT.phone}</a>,
            },
            {
              icon: Mail,
              label: "Email",
              value: (
                <a
                  className="break-words"
                  href={`mailto:${PRACTICE_CONTACT.email}`}
                >
                  {PRACTICE_CONTACT.email}
                </a>
              ),
            },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <IconTile as={icon} />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.08em] text-ink/50 uppercase">
                  {label}
                </p>
                <div className="text-[15px] leading-relaxed">{value}</div>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3 rounded-card bg-teal-tint p-6">
            <IconTile as={LifeBuoy} tone="teal" />
            <p className="min-w-0 text-sm leading-relaxed text-ink/80">
              If you are in crisis, call or text 988. This form is not monitored
              around the clock.
            </p>
          </div>
        </aside>
      </div>
    </MarketingPage>
  );
}
