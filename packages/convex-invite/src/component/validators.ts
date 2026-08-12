import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { deliveryState, invitationState, revokedReason } from "./schema.js";

export const invitationViewValidator = v.object({
  _id: v.id("invitations"),
  _creationTime: v.number(),
  scope: v.string(),
  resourceRef: v.string(),
  inviterRef: v.optional(v.string()),
  audienceRef: v.optional(v.string()),
  dedupeKey: v.string(),
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
});

export const invitationPageValidator = paginationResultValidator(
  invitationViewValidator,
);

export const issuedInvitationValidator = v.object({
  invitationId: v.id("invitations"),
  token: v.string(),
  expiresAt: v.number(),
});

export const acceptedGrantValidator = v.object({
  invitationId: v.id("invitations"),
  scope: v.string(),
  resourceRef: v.string(),
  role: v.optional(v.any()),
  payload: v.optional(v.any()),
  acceptedBy: v.string(),
  acceptedAt: v.number(),
  acceptanceResult: v.optional(v.any()),
});
