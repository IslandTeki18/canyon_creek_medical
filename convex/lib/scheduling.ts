// Appointment lifecycle: the single source of truth for statuses and the
// transitions between them. Validated server-side on every transition (5.6);
// the UI only decides which permitted actions to render.

import { type Infer, v } from "convex/values";

export const appointmentStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("confirmed"),
  v.literal("checkedIn"),
  v.literal("inProgress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("noShow"),
);
export type AppointmentStatus = Infer<typeof appointmentStatusValidator>;

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "checkedIn", "cancelled", "noShow"],
  confirmed: ["checkedIn", "cancelled", "noShow"],
  checkedIn: ["inProgress", "completed", "cancelled", "noShow"],
  inProgress: ["completed", "cancelled"],
  // Terminal states. Corrections go through a new appointment, never a
  // silent reopen — the event history must stay truthful.
  completed: [],
  cancelled: [],
  noShow: [],
};

/** Statuses that still occupy a slot. Cancelled/no-show free the time. */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "checkedIn",
  "inProgress",
  "completed",
];

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(
  from: AppointmentStatus,
): readonly AppointmentStatus[] {
  return TRANSITIONS[from];
}

export function occupiesSlot(status: AppointmentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
