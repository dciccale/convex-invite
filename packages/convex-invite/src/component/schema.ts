import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const invitationState = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("expired"),
  v.literal("revoked"),
);

export const deliveryState = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

export const revokedReason = v.union(
  v.literal("host_revoked"),
  v.literal("superseded_by_resend"),
  v.literal("inviter_disabled"),
  v.literal("resource_disabled"),
);

export default defineSchema({
  invitations: defineTable({
    scope: v.string(),
    resourceRef: v.string(),
    inviterRef: v.optional(v.string()),
    audienceRef: v.optional(v.string()),
    dedupeKey: v.string(),
    tokenDigest: v.string(),
    tokenDigestVersion: v.literal(1),
    state: invitationState,
    role: v.optional(v.any()),
    payload: v.optional(v.any()),
    acceptedBy: v.optional(v.string()),
    acceptanceResult: v.optional(v.any()),
    revokedReason: v.optional(revokedReason),
    deliveryState,
    deliveryAttempts: v.number(),
    lastDeliveryAttemptAt: v.optional(v.number()),
    lastDeliveryTransport: v.optional(v.string()),
    lastDeliveryErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_token_digest", ["tokenDigest"])
    .index("by_scope_dedupe_state", ["scope", "dedupeKey", "state"])
    .index("by_scope_resource_state_created", [
      "scope",
      "resourceRef",
      "state",
      "createdAt",
    ])
    .index("by_scope_state_created", ["scope", "state", "createdAt"])
    .index("by_scope_audience_state_created", [
      "scope",
      "audienceRef",
      "state",
      "createdAt",
    ])
    .index("by_state_expires", ["state", "expiresAt"])
    .index("by_state_updated", ["state", "updatedAt"])
    .index("by_scope_created", ["scope", "createdAt"]),
});
