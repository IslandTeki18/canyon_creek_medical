/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as domains_consents from "../domains/consents.js";
import type * as domains_forms from "../domains/forms.js";
import type * as domains_intake from "../domains/intake.js";
import type * as domains_patientInvitations from "../domains/patientInvitations.js";
import type * as domains_patients from "../domains/patients.js";
import type * as domains_portal from "../domains/portal.js";
import type * as domains_users from "../domains/users.js";
import type * as domains_workforce from "../domains/workforce.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_forms from "../lib/forms.js";
import type * as lib_invitations from "../lib/invitations.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_patients from "../lib/patients.js";
import type * as lib_permissions from "../lib/permissions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "domains/consents": typeof domains_consents;
  "domains/forms": typeof domains_forms;
  "domains/intake": typeof domains_intake;
  "domains/patientInvitations": typeof domains_patientInvitations;
  "domains/patients": typeof domains_patients;
  "domains/portal": typeof domains_portal;
  "domains/users": typeof domains_users;
  "domains/workforce": typeof domains_workforce;
  health: typeof health;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/forms": typeof lib_forms;
  "lib/invitations": typeof lib_invitations;
  "lib/logger": typeof lib_logger;
  "lib/patients": typeof lib_patients;
  "lib/permissions": typeof lib_permissions;
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
