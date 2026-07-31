/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as domains_alerts from "../domains/alerts.js";
import type * as domains_appointments from "../domains/appointments.js";
import type * as domains_assessments from "../domains/assessments.js";
import type * as domains_assignments from "../domains/assignments.js";
import type * as domains_clinical from "../domains/clinical.js";
import type * as domains_communications from "../domains/communications.js";
import type * as domains_consents from "../domains/consents.js";
import type * as domains_documents from "../domains/documents.js";
import type * as domains_encounters from "../domains/encounters.js";
import type * as domains_forms from "../domains/forms.js";
import type * as domains_intake from "../domains/intake.js";
import type * as domains_ketamine from "../domains/ketamine.js";
import type * as domains_mat from "../domains/mat.js";
import type * as domains_patientInvitations from "../domains/patientInvitations.js";
import type * as domains_patients from "../domains/patients.js";
import type * as domains_portal from "../domains/portal.js";
import type * as domains_psychiatricEvaluations from "../domains/psychiatricEvaluations.js";
import type * as domains_scheduling from "../domains/scheduling.js";
import type * as domains_tasks from "../domains/tasks.js";
import type * as domains_timeline from "../domains/timeline.js";
import type * as domains_users from "../domains/users.js";
import type * as domains_waitlist from "../domains/waitlist.js";
import type * as domains_workforce from "../domains/workforce.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as integrations_resend from "../integrations/resend.js";
import type * as integrations_twilio from "../integrations/twilio.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_assessments from "../lib/assessments.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_communications from "../lib/communications.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_forms from "../lib/forms.js";
import type * as lib_invitations from "../lib/invitations.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_patients from "../lib/patients.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_readiness from "../lib/readiness.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as lib_slots from "../lib/slots.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_webhooks from "../lib/webhooks.js";
import type * as scheduledJobs from "../scheduledJobs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "domains/alerts": typeof domains_alerts;
  "domains/appointments": typeof domains_appointments;
  "domains/assessments": typeof domains_assessments;
  "domains/assignments": typeof domains_assignments;
  "domains/clinical": typeof domains_clinical;
  "domains/communications": typeof domains_communications;
  "domains/consents": typeof domains_consents;
  "domains/documents": typeof domains_documents;
  "domains/encounters": typeof domains_encounters;
  "domains/forms": typeof domains_forms;
  "domains/intake": typeof domains_intake;
  "domains/ketamine": typeof domains_ketamine;
  "domains/mat": typeof domains_mat;
  "domains/patientInvitations": typeof domains_patientInvitations;
  "domains/patients": typeof domains_patients;
  "domains/portal": typeof domains_portal;
  "domains/psychiatricEvaluations": typeof domains_psychiatricEvaluations;
  "domains/scheduling": typeof domains_scheduling;
  "domains/tasks": typeof domains_tasks;
  "domains/timeline": typeof domains_timeline;
  "domains/users": typeof domains_users;
  "domains/waitlist": typeof domains_waitlist;
  "domains/workforce": typeof domains_workforce;
  health: typeof health;
  http: typeof http;
  "integrations/resend": typeof integrations_resend;
  "integrations/twilio": typeof integrations_twilio;
  "lib/access": typeof lib_access;
  "lib/assessments": typeof lib_assessments;
  "lib/audit": typeof lib_audit;
  "lib/communications": typeof lib_communications;
  "lib/documents": typeof lib_documents;
  "lib/forms": typeof lib_forms;
  "lib/invitations": typeof lib_invitations;
  "lib/logger": typeof lib_logger;
  "lib/patients": typeof lib_patients;
  "lib/permissions": typeof lib_permissions;
  "lib/readiness": typeof lib_readiness;
  "lib/scheduling": typeof lib_scheduling;
  "lib/slots": typeof lib_slots;
  "lib/time": typeof lib_time;
  "lib/webhooks": typeof lib_webhooks;
  scheduledJobs: typeof scheduledJobs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
