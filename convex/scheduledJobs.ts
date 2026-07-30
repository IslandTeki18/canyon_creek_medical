import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "materialize communication reminders",
  { minutes: 15 },
  internal.domains.communications.materializeReminderJobs,
  {},
);
crons.interval(
  "process outbound communications",
  { minutes: 1 },
  internal.domains.communications.processOutboundJobs,
  {},
);

crons.interval(
  "sweep MAT follow-up queue",
  { hours: 1 },
  internal.domains.mat.sweepQueue,
  {},
);

export default crons;
