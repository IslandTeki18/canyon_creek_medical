// Structured server logging. Context carries identifiers only — never PHI
// payloads (names, DOBs, message bodies, form answers). Reference the entity
// by type + id and look it up in the authorized UI instead.

export type LogSeverity = "debug" | "info" | "warn" | "error" | "critical";

export interface LogContext {
  /** Correlates all log lines for one inbound request or job run. */
  requestId?: string;
  /** Convex users table id of the acting user, if authenticated. */
  userId?: string;
  /** Table name of the primary entity, e.g. "patients". */
  entityType?: string;
  /** Id of the primary entity. */
  entityId?: string;
  /** Correlates across systems (webhook delivery id, vendor message sid). */
  correlationId?: string;
}

export function logEvent(
  severity: LogSeverity,
  event: string,
  context: LogContext = {},
): void {
  const line = JSON.stringify({ severity, event, ...context });
  if (severity === "error" || severity === "critical") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}
