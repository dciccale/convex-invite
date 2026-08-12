import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { Invitations } from "convex-invite";
import { components } from "./_generated/api.js";
import { internalMutation, mutation, query } from "./_generated/server.js";

const invites = new Invitations(components.invite, {
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  terminalRetentionMs: 90 * 24 * 60 * 60 * 1000,
});

/** Internal state change for the host delivery action. */
export const issueForDelivery = internalMutation({
  args: {
    scope: v.string(),
    resourceRef: v.string(),
    audienceRef: v.string(),
    inviterRef: v.string(),
    role: v.optional(v.any()),
  },
  returns: v.object({
    invitationId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const audienceRef = normalizeEmail(args.audienceRef);
    return await invites.issue(ctx, {
      ...args,
      audienceRef,
      dedupeKey: `${args.resourceRef}|${audienceRef}`,
    });
  },
});

/** Public projection: private payload, audience, IDs and delivery errors stay hidden. */
export const preview = query({
  args: { token: v.string() },
  returns: v.object({
    state: v.string(),
    resourceRef: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const invitation = await invites.getEffectiveByToken(ctx, args);
    return {
      state: invitation.state,
      resourceRef: invitation.resourceRef,
      expiresAt: invitation.expiresAt,
    };
  },
});

/**
 * Acceptance and membership creation are one top-level transaction. Any thrown
 * error rolls both the component acceptance and host membership back.
 */
export const accept = mutation({
  args: { token: v.string() },
  returns: v.object({ membershipId: v.id("memberships") }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Unauthenticated");
    if (!identity.email || identity.emailVerified !== true) {
      throw new Error("A verified email is required");
    }
    const audienceRef = normalizeEmail(identity.email);
    const grant = await invites.accept(ctx, {
      token: args.token,
      acceptedBy: identity.subject,
      audienceRef,
    });

    const savedResult = grant.acceptanceResult;
    if (
      savedResult !== undefined &&
      typeof savedResult === "object" &&
      savedResult !== null &&
      !Array.isArray(savedResult) &&
      "membershipId" in savedResult &&
      typeof savedResult.membershipId === "string"
    ) {
      const membershipId = ctx.db.normalizeId(
        "memberships",
        savedResult.membershipId,
      );
      if (membershipId !== null) return { membershipId };
    }

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_scope_subject_resource", (q) =>
        q
          .eq("scope", grant.scope)
          .eq("subject", identity.subject)
          .eq("resourceRef", grant.resourceRef),
      )
      .unique();
    const membershipId =
      existing?._id ??
      (await ctx.db.insert("memberships", {
        scope: grant.scope,
        resourceRef: grant.resourceRef,
        subject: identity.subject,
        role: grant.role,
        invitationId: grant.invitationId,
        createdAt: Date.now(),
      }));
    await invites.setAcceptanceResult(ctx, {
      scope: grant.scope,
      invitationId: grant.invitationId,
      acceptedBy: identity.subject,
      result: { membershipId },
    });
    return { membershipId };
  },
});

/** Audience-bound decline wrapper; it applies the same identity checks as accept. */
export const decline = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireVerifiedIdentity(ctx);
    await invites.decline(ctx, {
      token: args.token,
      declinedBy: identity.subject,
      audienceRef: normalizeEmail(identity.email),
    });
    return null;
  },
});

/** Manager-only revocation scoped by the host application. */
export const revoke = mutation({
  args: { scope: v.string(), invitationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);
    await invites.revoke(ctx, { ...args, reason: "host_revoked" });
    return null;
  },
});

/** Internal token rotation for the host delivery action. */
export const resendForDelivery = internalMutation({
  args: {
    scope: v.string(),
    invitationId: v.string(),
  },
  returns: v.object({
    invitationId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    audienceRef: v.string(),
  }),
  handler: async (ctx, args) => {
    const previous = await invites.getById(ctx, args);
    if (previous.audienceRef === undefined) {
      throw new Error("This invitation has no email audience");
    }
    const issued = await invites.resend(ctx, {
      scope: args.scope,
      invitationId: args.invitationId,
    });
    return {
      ...issued,
      audienceRef: previous.audienceRef,
    };
  },
});

export const listPending = query({
  args: { scope: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireManager(ctx);
    return await invites.listByState(ctx, { ...args, state: "pending" });
  },
});

type AuthContext = {
  auth: {
    getUserIdentity(): Promise<{
      subject: string;
      canManageInvites?: unknown;
    } | null>;
  };
};

async function requireManager(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || identity.canManageInvites !== true) {
    throw new Error("Not authorized to manage invitations");
  }
  return identity;
}

type VerifiedIdentityContext = {
  auth: {
    getUserIdentity(): Promise<{
      subject: string;
      email?: string;
      emailVerified?: boolean;
    } | null>;
  };
};

async function requireVerifiedIdentity(ctx: VerifiedIdentityContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || !identity.email || identity.emailVerified !== true) {
    throw new Error("A verified email is required");
  }
  return { ...identity, email: identity.email };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
