import { ConvexError } from "convex/values";

export const errorCodes = {
  notFound: "INVITATION_NOT_FOUND",
  alreadyPending: "INVITATION_ALREADY_PENDING",
  expired: "INVITATION_EXPIRED",
  alreadyAccepted: "INVITATION_ALREADY_ACCEPTED",
  declined: "INVITATION_DECLINED",
  revoked: "INVITATION_REVOKED",
  audienceMismatch: "INVITATION_AUDIENCE_MISMATCH",
  acceptedByAnother: "INVITATION_ACCEPTED_BY_ANOTHER_SUBJECT",
  notResendable: "INVITATION_NOT_RESENDABLE",
  scopeMismatch: "INVITATION_SCOPE_MISMATCH",
  invalidTransition: "INVITATION_INVALID_TRANSITION",
  invalidToken: "INVITATION_INVALID_TOKEN",
  payloadInvalid: "INVITATION_PAYLOAD_INVALID",
  invalidArgument: "INVITATION_INVALID_ARGUMENT",
} as const;

export type InvitationErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export function fail(code: InvitationErrorCode): never {
  throw new ConvexError({ code });
}
