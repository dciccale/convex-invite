import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationOptions,
} from "convex/server";
import type { Value } from "convex/values";
import type {
  ComponentApi,
  InvitationState,
  RevokedReason,
} from "../component/_generated/component.js";

export type {
  AcceptedGrant,
  InvitationPage,
  InvitationState,
  InvitationView,
  IssuedInvitation,
  RevokedReason,
} from "../component/_generated/component.js";

export const invitationErrorCodes = {
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

export type InvitationErrorCode =
  (typeof invitationErrorCodes)[keyof typeof invitationErrorCodes];

const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_TTL_MS = 7 * DAY;
export const DEFAULT_TERMINAL_RETENTION_MS = 90 * DAY;

type ReadCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type InvitationMutationContext = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runMutation"
> & {
  /** Mutation-only marker. Lifecycle methods do not access the host database. */
  readonly db: unknown;
};
export type InvitationDeliveryContext =
  | Pick<GenericMutationCtx<GenericDataModel>, "runMutation">
  | Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

export interface InvitationDeliveryAdapter<Message, MessageId> {
  /** Stable provider name stored in invitation delivery metadata. */
  transport: string;
  /** Queue one provider-specific message. Do not log its contents. */
  enqueue(ctx: InvitationDeliveryContext, message: Message): Promise<MessageId>;
  /** Safe code recorded when enqueue throws. Provider error text is discarded. */
  failureCode?: string;
}

export type InvitationDeliveryResult<MessageId> =
  | { state: "queued"; messageId: MessageId }
  | { state: "failed" };

export const DEFAULT_DELIVERY_FAILURE_CODE = "DELIVERY_ENQUEUE_FAILED";

export interface InvitationsOptions<
  Role extends Value = Value,
  Payload extends Value = Value,
  AcceptanceResult extends Value = Value,
> {
  ttlMs?: number;
  terminalRetentionMs?: number;
  roleParser?: (value: Value) => Role;
  payloadParser?: (value: Value) => Payload;
  acceptanceResultParser?: (value: Value) => AcceptanceResult;
}

/**
 * Typed host-side client for one named component mount.
 *
 * Authentication and authorization deliberately remain in the host mutation or
 * query that calls these methods.
 */
export class Invitations<
  Role extends Value = Value,
  Payload extends Value = Value,
  AcceptanceResult extends Value = Value,
> {
  readonly ttlMs: number;
  readonly terminalRetentionMs: number;

  constructor(
    private readonly component: ComponentApi,
    private readonly options: InvitationsOptions<
      Role,
      Payload,
      AcceptanceResult
    > = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.terminalRetentionMs =
      options.terminalRetentionMs ?? DEFAULT_TERMINAL_RETENTION_MS;
    assertClientDuration(this.ttlMs, "ttlMs");
    assertClientDuration(this.terminalRetentionMs, "terminalRetentionMs");
  }

  async issue(
    ctx: InvitationMutationContext,
    input: {
      scope: string;
      resourceRef: string;
      inviterRef?: string;
      audienceRef?: string;
      dedupeKey: string;
      role?: Role;
      payload?: Payload;
    },
  ) {
    const role =
      input.role === undefined
        ? undefined
        : (this.options.roleParser?.(input.role) ?? input.role);
    const payload =
      input.payload === undefined
        ? undefined
        : (this.options.payloadParser?.(input.payload) ?? input.payload);
    return await ctx.runMutation(this.component.invitations.issue, {
      ...input,
      role,
      payload,
      ttlMs: this.ttlMs,
    });
  }

  async resolve(ctx: InvitationMutationContext, input: { token: string }) {
    return await ctx.runMutation(this.component.invitations.resolve, input);
  }

  async getEffectiveByToken(ctx: ReadCtx, input: { token: string }) {
    return await ctx.runQuery(
      this.component.invitations.getEffectiveByToken,
      input,
    );
  }

  async accept(
    ctx: InvitationMutationContext,
    input: { token: string; acceptedBy: string; audienceRef?: string },
  ) {
    return await ctx.runMutation(this.component.invitations.accept, input);
  }

  async setAcceptanceResult(
    ctx: InvitationMutationContext,
    input: {
      scope: string;
      invitationId: string;
      acceptedBy: string;
      result: AcceptanceResult;
    },
  ) {
    const result =
      this.options.acceptanceResultParser?.(input.result) ?? input.result;
    return await ctx.runMutation(
      this.component.invitations.setAcceptanceResult,
      { ...input, result },
    );
  }

  async decline(
    ctx: InvitationMutationContext,
    input: { token: string; declinedBy: string; audienceRef?: string },
  ) {
    return await ctx.runMutation(this.component.invitations.decline, input);
  }

  async revoke(
    ctx: InvitationMutationContext,
    input: {
      scope: string;
      invitationId: string;
      reason: Exclude<RevokedReason, "superseded_by_resend">;
    },
  ) {
    return await ctx.runMutation(this.component.invitations.revoke, input);
  }

  async resend(
    ctx: InvitationMutationContext,
    input: { scope: string; invitationId: string },
  ) {
    return await ctx.runMutation(this.component.invitations.resend, {
      ...input,
      ttlMs: this.ttlMs,
    });
  }

  async recordDeliveryAttempt(
    ctx: InvitationDeliveryContext,
    input: {
      scope: string;
      invitationId: string;
      state: "queued" | "sent" | "failed";
      transport: string;
      errorCode?: string;
    },
  ) {
    return await ctx.runMutation(
      this.component.invitations.recordDeliveryAttempt,
      input,
    );
  }

  /**
   * Add provider delivery to this client without adding a provider dependency
   * to convex-invite. The returned helper works in mutations and actions.
   */
  withDelivery<Message, MessageId>(
    adapter: InvitationDeliveryAdapter<Message, MessageId>,
  ): InvitationDelivery<Message, MessageId, Role, Payload, AcceptanceResult> {
    return new InvitationDelivery(this, adapter);
  }

  async getById(ctx: ReadCtx, input: { scope: string; invitationId: string }) {
    return await ctx.runQuery(
      this.component.invitations.getByIdForManagement,
      input,
    );
  }

  async listByResource(
    ctx: ReadCtx,
    input: {
      scope: string;
      resourceRef: string;
      state: InvitationState;
      paginationOpts: PaginationOptions;
    },
  ) {
    return await ctx.runQuery(this.component.invitations.listByResource, input);
  }

  async listByState(
    ctx: ReadCtx,
    input: {
      scope: string;
      state: InvitationState;
      paginationOpts: PaginationOptions;
    },
  ) {
    return await ctx.runQuery(this.component.invitations.listByState, input);
  }

  async listPendingByAudience(
    ctx: ReadCtx,
    input: {
      scope: string;
      audienceRef: string;
      paginationOpts: PaginationOptions;
    },
  ) {
    return await ctx.runQuery(
      this.component.invitations.listPendingByAudience,
      input,
    );
  }

  async prune(
    ctx: InvitationMutationContext,
    options: { limit?: number } = {},
  ) {
    return await ctx.runMutation(this.component.invitations.prune, {
      terminalRetentionMs: this.terminalRetentionMs,
      ...options,
    });
  }

  async exportByScope(ctx: ReadCtx, input: { scope: string; limit?: number }) {
    return await ctx.runQuery(this.component.invitations.exportByScope, input);
  }

  async deleteByScope(
    ctx: InvitationMutationContext,
    input: { scope: string; limit?: number },
  ) {
    return await ctx.runMutation(
      this.component.invitations.deleteByScope,
      input,
    );
  }
}

/**
 * Provider-neutral delivery coordinator.
 *
 * The host owns message rendering and the provider client. This helper queues
 * the supplied message and records only safe delivery metadata.
 */
export class InvitationDelivery<
  Message,
  MessageId,
  Role extends Value = Value,
  Payload extends Value = Value,
  AcceptanceResult extends Value = Value,
> {
  readonly transport: string;
  readonly failureCode: string;

  constructor(
    private readonly invitations: Invitations<Role, Payload, AcceptanceResult>,
    private readonly adapter: InvitationDeliveryAdapter<Message, MessageId>,
  ) {
    assertClientString(adapter.transport, "transport", 64);
    this.transport = adapter.transport;
    this.failureCode = adapter.failureCode ?? DEFAULT_DELIVERY_FAILURE_CODE;
    assertClientString(this.failureCode, "failureCode", 128);
  }

  async deliver(
    ctx: InvitationDeliveryContext,
    input: {
      scope: string;
      invitationId: string;
      message: Message;
    },
  ): Promise<InvitationDeliveryResult<MessageId>> {
    let messageId: MessageId;
    try {
      messageId = await this.adapter.enqueue(ctx, input.message);
    } catch {
      await this.invitations.recordDeliveryAttempt(ctx, {
        scope: input.scope,
        invitationId: input.invitationId,
        state: "failed",
        transport: this.transport,
        errorCode: this.failureCode,
      });
      return { state: "failed" };
    }

    await this.invitations.recordDeliveryAttempt(ctx, {
      scope: input.scope,
      invitationId: input.invitationId,
      state: "queued",
      transport: this.transport,
    });
    return { state: "queued", messageId };
  }
}

function assertClientDuration(value: number, name: string): void {
  const maximum = 365 * DAY;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
}

function assertClientString(
  value: string,
  name: string,
  maximum: number,
): void {
  if (value.length < 1 || value.length > maximum) {
    throw new Error(`${name} must contain between 1 and ${maximum} characters`);
  }
}
