import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  memberships: defineTable({
    scope: v.string(),
    resourceRef: v.string(),
    subject: v.string(),
    role: v.optional(v.any()),
    invitationId: v.string(),
    createdAt: v.number(),
  }).index("by_scope_subject_resource", ["scope", "subject", "resourceRef"]),
});
