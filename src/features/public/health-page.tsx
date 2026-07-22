import { useEffect, useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// ponytail: untyped reference until convex/_generated exists; then use api.health.ping.
const healthPing = makeFunctionReference<
  "query",
  Record<string, never>,
  { ok: true }
>("health:ping");

type BackendStatus = "checking" | "connected" | "unreachable" | "unconfigured";

const CONVEX_URL: string | undefined = import.meta.env.VITE_CONVEX_URL;

export default function HealthPage() {
  const [backend, setBackend] = useState<BackendStatus>(
    CONVEX_URL ? "checking" : "unconfigured",
  );

  useEffect(() => {
    if (!CONVEX_URL) return;
    let cancelled = false;
    new ConvexHttpClient(CONVEX_URL)
      .query(healthPing, {})
      .then(() => !cancelled && setBackend("connected"))
      .catch(() => !cancelled && setBackend("unreachable"));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: ReadonlyArray<[string, string]> = [
    ["Environment", import.meta.env.MODE],
    ["Convex URL configured", CONVEX_URL ? "yes" : "no"],
    ["Backend connectivity", backend],
  ];

  return (
    <section>
      <h1 className="text-xl font-semibold">Health</h1>
      <dl className="mt-4 max-w-sm text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b py-2">
            <dt className="text-neutral-600">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
