import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { errorCodes, fail } from "./errors.js";
import { toEffectiveView, toGrant, toView } from "./model.js";
import { invitationState, revokedReason } from "./schema.js";
import {
  assertDuration,
  assertJson,
  assertLimit,
  assertString,
  createToken,
  digestToken,
  jsonValuesEqual,
} from "./security.js";
import {
  acceptedGrantValidator,
  invitationPageValidator,
  invitationViewValidator,
  issuedInvitationValidator,
} from "./validators.js";

const issueArgs = {
  scope: v.string(),
  resourceRef: v.string(),
  inviterRef: v.optional(v.string()),
  audienceRef: v.optional(v.string()),
  dedupeKey: v.string(),
  role: v.optional(v.any()),
  payload: v.optional(v.any()),
  ttlMs: v.number(),
};

function validateIssueArgs(args: {
  scope: string;
  resourceRef: string;
  inviterRef?: string;
  audienceRef?: string;
  dedupeKey: string;
  role?: unknown;
  payload?: unknown;
  ttlMs: number;
}) {
  assertString(args.scope, { max: 256 });
  assertString(args.resourceRef, { max: 512 });
  assertString(args.dedupeKey, { max: 512 });
  if (args.inviterRef !== undefined)
    assertString(args.inviterRef, { max: 512 });
  if (args.audienceRef !== undefined)
    assertString(args.audienceRef, { max: 512 });
  if (args.role !== undefined) assertJson(args.role);
  if (args.payload !== undefined) assertJson(args.payload);
  assertDuration(args.ttlMs);
}

async function findByToken(ctx: QueryCtx | MutationCtx, token: string) {
  const tokenDigest = await digestToken(token);
  return await ctx.db
    .query("invitations")
    .withIndex("by_token_digest", (q) => q.eq("tokenDigest", tokenDigest))
    .unique();
}

async function getById(
  ctx: QueryCtx | MutationCtx,
  scope: string,
  invitationId: Id<"invitations">,
) {
  assertString(scope, { max: 256 });
  const invitation = await ctx.db.get("invitations", invitationId);
  if (invitation === null) fail(errorCodes.notFound);
  if (invitation.scope !== scope) fail(errorCodes.scopeMismatch);
  return invitation;
}

function assertAudience(invitation: Doc<"invitations">, audienceRef?: string) {
  if (invitation.audienceRef === undefined) return;
  if (audienceRef === undefined || audienceRef !== invitation.audienceRef) {
    fail(errorCodes.audienceMismatch);
  }
}

function failForTerminal(invitation: Doc<"invitations">): never {
  if (invitation.state === "accepted") fail(errorCodes.alreadyAccepted);
  if (invitation.state === "declined") fail(errorCodes.declined);
  if (invitation.state === "expired") fail(errorCodes.expired);
  if (invitation.state === "revoked") fail(errorCodes.revoked);
  fail(errorCodes.invalidTransition);
}

async function insertInvitation(
  ctx: MutationCtx,
  input: Omit<Doc<"invitations">, "_id" | "_creationTime">,
) {
  return await ctx.db.insert("invitations", input);
}

export const issue = mutation({
  args: issueArgs,
  returns: issuedInvitationValidator,
  handler: async (ctx, args) => {
    validateIssueArgs(args);
    const now = Date.now();
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_scope_dedupe_state", (q) =>
        q
          .eq("scope", args.scope)
          .eq("dedupeKey", args.dedupeKey)
          .eq("state", "pending"),
      )
      .unique();
    if (existing !== null) {
      if (existing.expiresAt > now) fail(errorCodes.alreadyPending);
      await ctx.db.patch("invitations", existing._id, {
        state: "expired",
        expiredAt: now,
        updatedAt: now,
      });
    }

    const token = createToken();
    const tokenDigest = await digestToken(token);
    const expiresAt = now + args.ttlMs;
    const invitationId = await insertInvitation(ctx, {
      scope: args.scope,
      resourceRef: args.resourceRef,
      inviterRef: args.inviterRef,
      audienceRef: args.audienceRef,
      dedupeKey: args.dedupeKey,
      tokenDigest,
      tokenDigestVersion: 1,
      state: "pending",
      role: args.role,
      payload: args.payload,
      deliveryState: "queued",
      deliveryAttempts: 0,
      createdAt: now,
      expiresAt,
      updatedAt: now,
    });
    return { invitationId, token, expiresAt };
  },
});

export const getEffectiveByToken = query({
  args: { token: v.string() },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    const invitation = await findByToken(ctx, args.token);
    if (invitation === null) fail(errorCodes.invalidToken);
    return toEffectiveView(invitation, Date.now());
  },
});

export const resolve = mutation({
  args: { token: v.string() },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    const invitation = await findByToken(ctx, args.token);
    if (invitation === null) fail(errorCodes.invalidToken);
    const now = Date.now();
    if (invitation.state === "pending" && invitation.expiresAt <= now) {
      await ctx.db.patch("invitations", invitation._id, {
        state: "expired",
        expiredAt: now,
        updatedAt: now,
      });
      const updated = await ctx.db.get("invitations", invitation._id);
      if (updated === null) fail(errorCodes.notFound);
      return toView(updated);
    }
    return toView(invitation);
  },
});

export const accept = mutation({
  args: {
    token: v.string(),
    acceptedBy: v.string(),
    audienceRef: v.optional(v.string()),
  },
  returns: acceptedGrantValidator,
  handler: async (ctx, args) => {
    assertString(args.acceptedBy, { max: 512 });
    if (args.audienceRef !== undefined)
      assertString(args.audienceRef, { max: 512 });
    const invitation = await findByToken(ctx, args.token);
    if (invitation === null) fail(errorCodes.invalidToken);

    if (invitation.state === "accepted") {
      if (invitation.acceptedBy !== args.acceptedBy) {
        fail(errorCodes.acceptedByAnother);
      }
      return toGrant(invitation);
    }
    if (invitation.state !== "pending") failForTerminal(invitation);
    if (invitation.expiresAt <= Date.now()) fail(errorCodes.expired);
    assertAudience(invitation, args.audienceRef);

    const now = Date.now();
    await ctx.db.patch("invitations", invitation._id, {
      state: "accepted",
      acceptedBy: args.acceptedBy,
      acceptedAt: now,
      updatedAt: now,
    });
    const accepted = await ctx.db.get("invitations", invitation._id);
    if (accepted === null) fail(errorCodes.notFound);
    return toGrant(accepted);
  },
});

export const setAcceptanceResult = mutation({
  args: {
    scope: v.string(),
    invitationId: v.id("invitations"),
    acceptedBy: v.string(),
    result: v.any(),
  },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    assertString(args.acceptedBy, { max: 512 });
    assertJson(args.result);
    const invitation = await getById(ctx, args.scope, args.invitationId);
    if (invitation.state !== "accepted") fail(errorCodes.invalidTransition);
    if (invitation.acceptedBy !== args.acceptedBy) {
      fail(errorCodes.acceptedByAnother);
    }
    if (invitation.acceptanceResult !== undefined) {
      if (!jsonValuesEqual(invitation.acceptanceResult, args.result)) {
        fail(errorCodes.invalidTransition);
      }
      return toView(invitation);
    }
    const now = Date.now();
    await ctx.db.patch("invitations", invitation._id, {
      acceptanceResult: args.result,
      updatedAt: now,
    });
    const updated = await ctx.db.get("invitations", invitation._id);
    if (updated === null) fail(errorCodes.notFound);
    return toView(updated);
  },
});

export const decline = mutation({
  args: {
    token: v.string(),
    declinedBy: v.string(),
    audienceRef: v.optional(v.string()),
  },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    assertString(args.declinedBy, { max: 512 });
    if (args.audienceRef !== undefined)
      assertString(args.audienceRef, { max: 512 });
    const invitation = await findByToken(ctx, args.token);
    if (invitation === null) fail(errorCodes.invalidToken);
    if (invitation.state !== "pending") failForTerminal(invitation);
    if (invitation.expiresAt <= Date.now()) fail(errorCodes.expired);
    assertAudience(invitation, args.audienceRef);
    const now = Date.now();
    await ctx.db.patch("invitations", invitation._id, {
      state: "declined",
      declinedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get("invitations", invitation._id);
    if (updated === null) fail(errorCodes.notFound);
    return toView(updated);
  },
});

export const revoke = mutation({
  args: {
    scope: v.string(),
    invitationId: v.id("invitations"),
    reason: revokedReason,
  },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    if (args.reason === "superseded_by_resend") {
      fail(errorCodes.invalidArgument);
    }
    const invitation = await getById(ctx, args.scope, args.invitationId);
    if (invitation.state !== "pending") failForTerminal(invitation);
    if (invitation.expiresAt <= Date.now()) fail(errorCodes.expired);
    const now = Date.now();
    await ctx.db.patch("invitations", invitation._id, {
      state: "revoked",
      revokedReason: args.reason,
      revokedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get("invitations", invitation._id);
    if (updated === null) fail(errorCodes.notFound);
    return toView(updated);
  },
});

export const resend = mutation({
  args: {
    scope: v.string(),
    invitationId: v.id("invitations"),
    ttlMs: v.number(),
  },
  returns: issuedInvitationValidator,
  handler: async (ctx, args) => {
    assertDuration(args.ttlMs);
    const invitation = await getById(ctx, args.scope, args.invitationId);
    if (invitation.state !== "pending" || invitation.expiresAt <= Date.now()) {
      fail(errorCodes.notResendable);
    }
    const now = Date.now();
    const token = createToken();
    const tokenDigest = await digestToken(token);
    const expiresAt = now + args.ttlMs;

    await ctx.db.patch("invitations", invitation._id, {
      state: "revoked",
      revokedReason: "superseded_by_resend",
      revokedAt: now,
      updatedAt: now,
    });
    const invitationId = await insertInvitation(ctx, {
      scope: invitation.scope,
      resourceRef: invitation.resourceRef,
      inviterRef: invitation.inviterRef,
      audienceRef: invitation.audienceRef,
      dedupeKey: invitation.dedupeKey,
      tokenDigest,
      tokenDigestVersion: 1,
      state: "pending",
      role: invitation.role,
      payload: invitation.payload,
      deliveryState: "queued",
      deliveryAttempts: 0,
      createdAt: now,
      expiresAt,
      updatedAt: now,
    });
    return { invitationId, token, expiresAt };
  },
});

export const recordDeliveryAttempt = mutation({
  args: {
    scope: v.string(),
    invitationId: v.id("invitations"),
    state: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    transport: v.string(),
    errorCode: v.optional(v.string()),
  },
  returns: invitationViewValidator,
  handler: async (ctx, args) => {
    assertString(args.transport, { max: 64 });
    if (args.errorCode !== undefined)
      assertString(args.errorCode, { max: 128 });
    if (args.state !== "failed" && args.errorCode !== undefined) {
      fail(errorCodes.invalidArgument);
    }
    const invitation = await getById(ctx, args.scope, args.invitationId);
    const now = Date.now();
    await ctx.db.patch("invitations", invitation._id, {
      deliveryState: args.state,
      deliveryAttempts: invitation.deliveryAttempts + 1,
      lastDeliveryAttemptAt: now,
      lastDeliveryTransport: args.transport,
      lastDeliveryErrorCode:
        args.state === "failed" ? args.errorCode : undefined,
      updatedAt: now,
    });
    const updated = await ctx.db.get("invitations", invitation._id);
    if (updated === null) fail(errorCodes.notFound);
    return toView(updated);
  },
});

export const getByIdForManagement = query({
  args: { scope: v.string(), invitationId: v.id("invitations") },
  returns: invitationViewValidator,
  handler: async (ctx, args) =>
    toEffectiveView(
      await getById(ctx, args.scope, args.invitationId),
      Date.now(),
    ),
});

export const listByResource = query({
  args: {
    scope: v.string(),
    resourceRef: v.string(),
    state: invitationState,
    paginationOpts: paginationOptsValidator,
  },
  returns: invitationPageValidator,
  handler: async (ctx, args) => {
    assertString(args.scope, { max: 256 });
    assertString(args.resourceRef, { max: 512 });
    assertLimit(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("invitations")
      .withIndex("by_scope_resource_state_created", (q) =>
        q
          .eq("scope", args.scope)
          .eq("resourceRef", args.resourceRef)
          .eq("state", args.state),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toView) };
  },
});

export const listByState = query({
  args: {
    scope: v.string(),
    state: invitationState,
    paginationOpts: paginationOptsValidator,
  },
  returns: invitationPageValidator,
  handler: async (ctx, args) => {
    assertString(args.scope, { max: 256 });
    assertLimit(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("invitations")
      .withIndex("by_scope_state_created", (q) =>
        q.eq("scope", args.scope).eq("state", args.state),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toView) };
  },
});

export const listPendingByAudience = query({
  args: {
    scope: v.string(),
    audienceRef: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: invitationPageValidator,
  handler: async (ctx, args) => {
    assertString(args.scope, { max: 256 });
    assertString(args.audienceRef, { max: 512 });
    assertLimit(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("invitations")
      .withIndex("by_scope_audience_state_created", (q) =>
        q
          .eq("scope", args.scope)
          .eq("audienceRef", args.audienceRef)
          .eq("state", "pending"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((doc) => toEffectiveView(doc, Date.now())),
    };
  },
});

export const prune = mutation({
  args: {
    terminalRetentionMs: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.object({ expired: v.number(), deleted: v.number() }),
  handler: async (ctx, args) => {
    assertDuration(args.terminalRetentionMs);
    const limit = args.limit ?? 100;
    assertLimit(limit);
    const now = Date.now();
    const overdue = await ctx.db
      .query("invitations")
      .withIndex("by_state_expires", (q) =>
        q.eq("state", "pending").lte("expiresAt", now),
      )
      .take(limit);
    for (const invitation of overdue) {
      await ctx.db.patch("invitations", invitation._id, {
        state: "expired",
        expiredAt: now,
        updatedAt: now,
      });
    }

    let remaining = limit - overdue.length;
    let deleted = 0;
    const cutoff = now - args.terminalRetentionMs;
    const terminalStates = [
      "accepted",
      "declined",
      "expired",
      "revoked",
    ] as const;
    for (const state of terminalStates) {
      if (remaining === 0) break;
      const candidates = await ctx.db
        .query("invitations")
        .withIndex("by_state_updated", (q) =>
          q.eq("state", state).lte("updatedAt", cutoff),
        )
        .take(remaining);
      for (const invitation of candidates) await ctx.db.delete(invitation._id);
      deleted += candidates.length;
      remaining -= candidates.length;
    }
    return { expired: overdue.length, deleted };
  },
});

export const exportByScope = query({
  args: { scope: v.string(), limit: v.optional(v.number()) },
  returns: v.array(invitationViewValidator),
  handler: async (ctx, args) => {
    assertString(args.scope, { max: 256 });
    const limit = args.limit ?? 100;
    assertLimit(limit);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_scope_created", (q) => q.eq("scope", args.scope))
      .order("asc")
      .take(limit);
    return rows.map(toView);
  },
});

export const deleteByScope = mutation({
  args: { scope: v.string(), limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    assertString(args.scope, { max: 256 });
    const limit = args.limit ?? 100;
    assertLimit(limit);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_scope_created", (q) => q.eq("scope", args.scope))
      .take(limit + 1);
    const toDelete = rows.slice(0, limit);
    for (const invitation of toDelete) await ctx.db.delete(invitation._id);
    return { deleted: toDelete.length, hasMore: rows.length > limit };
  },
});
