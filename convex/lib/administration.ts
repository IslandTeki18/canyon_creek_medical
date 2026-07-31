// Service configuration rules (Increment 12.1). One place decides whether a
// service may be booked, so the catalog screen, slot generation, and the
// booking mutation cannot drift apart.
import type { Doc } from "../_generated/dataModel";

/**
 * A service is bookable only while active and inside its effective window.
 * "future" services are fully configurable but never bookable, which is how
 * a service is set up ahead of its launch date without risking a booking.
 */
export function serviceInForce(service: Doc<"services">, at: number): boolean {
  return (
    service.status === "active" &&
    (service.effectiveFrom === undefined || service.effectiveFrom <= at) &&
    (service.effectiveTo === undefined || service.effectiveTo > at)
  );
}

/** Human-readable reason a service is not bookable, or null when it is. */
export function serviceBlockReason(
  service: Doc<"services">,
  at: number,
): string | null {
  if (service.status === "future") return "Service is not yet in service";
  if (service.status === "disabled") return "Service is disabled";
  if (service.effectiveFrom !== undefined && service.effectiveFrom > at) {
    return "Service is not yet effective";
  }
  if (service.effectiveTo !== undefined && service.effectiveTo <= at) {
    return "Service is no longer effective";
  }
  return null;
}

export function validateEffectiveWindow(args: {
  effectiveFrom?: number;
  effectiveTo?: number;
}): void {
  if (
    args.effectiveFrom !== undefined &&
    args.effectiveTo !== undefined &&
    args.effectiveTo <= args.effectiveFrom
  ) {
    throw new Error("The effective end must come after the effective start");
  }
}
