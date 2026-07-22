# Observability Baseline

## Purpose

Enough evidence to diagnose failures from day one without ever putting PHI in a log line.

## Structured server logging

Use `convex/lib/logger.ts` (`logEvent(severity, event, context)`) for all server-side logging. One JSON line per event.

- `event` is a stable dot-separated code (`webhook.clerk.replay_rejected`, `reminder.send_failed`), not free text.
- `context` carries identifiers only: `requestId`, `userId`, `entityType`, `entityId`, `correlationId`.
- **Never log PHI**: no names, dates of birth, contact details, message bodies, form answers, or clinical content. Log the entity id; authorized users look the record up in the app.

## Severity levels

| Severity   | Meaning                                                        | Examples                                                        |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `debug`    | Development diagnostics; not expected in production            | Slot-generation internals                                       |
| `info`     | Normal notable events                                          | Job run completed, webhook processed                            |
| `warn`     | Degraded but self-recovering                                   | Transient send failure entering retry                           |
| `error`    | Operation failed; user or staff impact; needs investigation    | Exhausted retries, signature verification failure               |
| `critical` | Safety, privacy, or integrity risk; needs immediate escalation | Suspected PHI leak, audit write failure, forged webhook pattern |

## Client errors

The route error boundary (`RouteError` in `src/components/app-shell.tsx`) shows the user a neutral message plus a short random **reference id**, and logs a structured `client.route_error` event with that id to the console. Support asks the user for the reference id and correlates it with logs; the error state itself exposes no error internals or PHI.

## Log retention (production expectations)

- Convex retains function logs only briefly in the dashboard. Before pilot (Increment 13), configure a log stream (e.g. Convex log streaming to Axiom or Datadog) with **30 days hot retention minimum**; audit-relevant events live in the database `auditEvents` table (Increment 1+), not in logs — logs are diagnostics, the audit table is the record.
- `debug` is disabled in production. `critical` events should page a human once alerting exists.
- Log streams must be access-controlled like production systems; even PHI-free logs reveal operational metadata.

## Health view

`/health` shows environment mode, whether the Convex URL is configured, and live backend connectivity via the public `health.ping` query. It exposes no secrets and no data.
