import type { Doc } from "./_generated/dataModel.js";

export function toView(doc: Doc<"invitations">) {
  const { tokenDigest, tokenDigestVersion, ...view } = doc;
  void tokenDigest;
  void tokenDigestVersion;
  return view;
}

export function toEffectiveView(doc: Doc<"invitations">, now: number) {
  const view = toView(doc);
  if (doc.state === "pending" && doc.expiresAt <= now) {
    return {
      ...view,
      state: "expired" as const,
      expiredAt: doc.expiresAt,
      updatedAt: Math.max(doc.updatedAt, doc.expiresAt),
    };
  }
  return view;
}

export function toGrant(doc: Doc<"invitations">) {
  if (
    doc.state !== "accepted" ||
    doc.acceptedBy === undefined ||
    doc.acceptedAt === undefined
  ) {
    throw new Error("Internal invitation acceptance invariant violated");
  }
  return {
    invitationId: doc._id,
    scope: doc.scope,
    resourceRef: doc.resourceRef,
    role: doc.role,
    payload: doc.payload,
    acceptedBy: doc.acceptedBy,
    acceptedAt: doc.acceptedAt,
    acceptanceResult: doc.acceptanceResult,
  };
}
