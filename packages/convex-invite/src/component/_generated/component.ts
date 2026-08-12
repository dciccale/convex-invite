/* eslint-disable */
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";

export type InvitationState =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked";
export type RevokedReason =
  | "host_revoked"
  | "superseded_by_resend"
  | "inviter_disabled"
  | "resource_disabled";
export type InvitationView = {
  _creationTime: number;
  _id: string;
  scope: string;
  resourceRef: string;
  inviterRef?: string;
  audienceRef?: string;
  dedupeKey: string;
  state: InvitationState;
  role?: Value;
  payload?: Value;
  acceptedBy?: string;
  acceptanceResult?: Value;
  revokedReason?: RevokedReason;
  deliveryState: "queued" | "sent" | "failed";
  deliveryAttempts: number;
  lastDeliveryAttemptAt?: number;
  lastDeliveryTransport?: string;
  lastDeliveryErrorCode?: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  declinedAt?: number;
  expiredAt?: number;
  revokedAt?: number;
  updatedAt: number;
};
export type IssuedInvitation = {
  invitationId: string;
  token: string;
  expiresAt: number;
};
export type AcceptedGrant = {
  invitationId: string;
  scope: string;
  resourceRef: string;
  role?: Value;
  payload?: Value;
  acceptedBy: string;
  acceptedAt: number;
  acceptanceResult?: Value;
};
export type PaginationOptions = {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};
export type InvitationPage = {
  page: InvitationView[];
  continueCursor: string;
  isDone: boolean;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};

type Ref<
  Kind extends "query" | "mutation",
  Args extends Record<string, Value | undefined>,
  Result,
  Name extends string | undefined,
> = FunctionReference<Kind, "internal", Args, Result, Name>;

export type ComponentApi<Name extends string | undefined = string | undefined> = {
  invitations: {
    issue: Ref<"mutation", {
      scope: string; resourceRef: string; inviterRef?: string; audienceRef?: string;
      dedupeKey: string; role?: Value; payload?: Value; ttlMs: number;
    }, IssuedInvitation, Name>;
    getEffectiveByToken: Ref<"query", { token: string }, InvitationView, Name>;
    resolve: Ref<"mutation", { token: string }, InvitationView, Name>;
    accept: Ref<"mutation", {
      token: string; acceptedBy: string; audienceRef?: string;
    }, AcceptedGrant, Name>;
    setAcceptanceResult: Ref<"mutation", {
      scope: string; invitationId: string; acceptedBy: string; result: Value;
    }, InvitationView, Name>;
    decline: Ref<"mutation", {
      token: string; declinedBy: string; audienceRef?: string;
    }, InvitationView, Name>;
    revoke: Ref<"mutation", {
      scope: string; invitationId: string; reason: Exclude<RevokedReason, "superseded_by_resend">;
    }, InvitationView, Name>;
    resend: Ref<"mutation", {
      scope: string; invitationId: string; ttlMs: number;
    }, IssuedInvitation, Name>;
    recordDeliveryAttempt: Ref<"mutation", {
      scope: string; invitationId: string; state: "queued" | "sent" | "failed";
      transport: string; errorCode?: string;
    }, InvitationView, Name>;
    getByIdForManagement: Ref<"query", {
      scope: string; invitationId: string;
    }, InvitationView, Name>;
    listByResource: Ref<"query", {
      scope: string; resourceRef: string; state: InvitationState;
      paginationOpts: PaginationOptions;
    }, InvitationPage, Name>;
    listByState: Ref<"query", {
      scope: string; state: InvitationState; paginationOpts: PaginationOptions;
    }, InvitationPage, Name>;
    listPendingByAudience: Ref<"query", {
      scope: string; audienceRef: string; paginationOpts: PaginationOptions;
    }, InvitationPage, Name>;
    prune: Ref<"mutation", {
      terminalRetentionMs: number; limit?: number;
    }, { expired: number; deleted: number }, Name>;
    exportByScope: Ref<"query", {
      scope: string; limit?: number;
    }, InvitationView[], Name>;
    deleteByScope: Ref<"mutation", {
      scope: string; limit?: number;
    }, { deleted: number; hasMore: boolean }, Name>;
  };
};
