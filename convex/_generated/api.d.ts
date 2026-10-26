/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as domains_audit from "../domains/audit.js";
import type * as domains_blog from "../domains/blog.js";
import type * as domains_content from "../domains/content.js";
import type * as domains_contentSeed from "../domains/contentSeed.js";
import type * as domains_users from "../domains/users.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_content from "../lib/content.js";
import type * as lib_contentImages from "../lib/contentImages.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_permissions from "../lib/permissions.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "domains/audit": typeof domains_audit;
  "domains/blog": typeof domains_blog;
  "domains/content": typeof domains_content;
  "domains/contentSeed": typeof domains_contentSeed;
  "domains/users": typeof domains_users;
  health: typeof health;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/content": typeof lib_content;
  "lib/contentImages": typeof lib_contentImages;
  "lib/logger": typeof lib_logger;
  "lib/permissions": typeof lib_permissions;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
