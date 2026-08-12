import { v } from "convex/values";
import { Invitations } from "convex-invite";
import { components, internal } from "./_generated/api.js";
import { action } from "./_generated/server.js";

const invites = new Invitations(components.invite);
const webhookDelivery = invites.withDelivery<
  { to: string; inviteUrl: string },
  void
>({
  transport: "email-webhook",
  enqueue: async (_ctx, message) => {
    const endpoint = process.env.EMAIL_WEBHOOK_URL;
    if (!endpoint) throw new Error("EMAIL_WEBHOOK_URL is not configured");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Transport rejected request");
  },
});

/**
 * Example transport only. A successful response means the host-owned webhook
 * accepted the request; that webhook is responsible for rendering and sending
 * the actual email. No email provider is bundled with this example.
 */
export const issue = action({
  args: {
    scope: v.string(),
    resourceRef: v.string(),
    audienceRef: v.string(),
    role: v.optional(v.any()),
  },
  returns: v.object({ invitationId: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<PublicDeliveryResult> => {
    const manager = await requireManager(ctx);
    const issued: IssuedInvitation = await ctx.runMutation(
      internal.invites.issueForDelivery,
      {
        ...args,
        inviterRef: manager.subject,
      },
    );
    await deliverInvitation(ctx, {
      ...issued,
      scope: args.scope,
      audienceRef: normalizeEmail(args.audienceRef),
    });
    return {
      invitationId: issued.invitationId,
      expiresAt: issued.expiresAt,
    };
  },
});

export const resend = action({
  args: { scope: v.string(), invitationId: v.string() },
  returns: v.object({ invitationId: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<PublicDeliveryResult> => {
    await requireManager(ctx);
    const issued: IssuedInvitation & { audienceRef: string } =
      await ctx.runMutation(internal.invites.resendForDelivery, args);
    await deliverInvitation(ctx, { ...issued, scope: args.scope });
    return {
      invitationId: issued.invitationId,
      expiresAt: issued.expiresAt,
    };
  },
});

type DeliveryContext = Parameters<typeof webhookDelivery.deliver>[0];
type IssuedInvitation = {
  invitationId: string;
  token: string;
  expiresAt: number;
};
type PublicDeliveryResult = Omit<IssuedInvitation, "token">;

async function deliverInvitation(
  ctx: DeliveryContext,
  input: {
    invitationId: string;
    scope: string;
    audienceRef: string;
    token: string;
  },
) {
  await webhookDelivery.deliver(ctx, {
    invitationId: input.invitationId,
    scope: input.scope,
    message: {
      to: input.audienceRef,
      inviteUrl: `https://app.example.com/invitations/${input.token}`,
    },
  });
}

type ManagerContext = {
  auth: {
    getUserIdentity(): Promise<{
      subject: string;
      canManageInvites?: unknown;
    } | null>;
  };
};

async function requireManager(ctx: ManagerContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || identity.canManageInvites !== true) {
    throw new Error("Not authorized to manage invitations");
  }
  return identity;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
