import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type { ComponentApi } from "convex-invite/_generated/component.js";
import type * as delivery from "../delivery.js";
import type * as invites from "../invites.js";

declare const fullApi: ApiFromModules<{
  delivery: typeof delivery;
  invites: typeof invites;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<unknown, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<unknown, "internal">
>;
export declare const components: { invite: ComponentApi<"invite"> };
