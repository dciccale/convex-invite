# Invitation delivery

`convex-invite` does not depend on an email provider. The host injects a
provider function through `withDelivery()`. The helper queues the message and
records the safe result.

`issue()` always works without a delivery adapter. The package never performs a
silent send when no adapter exists.

## What the checked-in example does

[`apps/example/convex/delivery.ts`](../apps/example/convex/delivery.ts) injects
a generic webhook transport. Its public action calls an internal issue or
resend mutation, receives the token in memory, and then invokes this adapter:

```ts
const webhookDelivery = invites.withDelivery<
  { to: string; inviteUrl: string },
  void
>({
  transport: "email-webhook",
  enqueue: async (_ctx, message) => {
    const response = await fetch(process.env.EMAIL_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("Transport rejected request");
  },
});
```

The service receives `{ to, inviteUrl }`. It must render and send the email.
`deliver()` records `queued` after a successful response. It records `failed`
with `DELIVERY_ENQUEUE_FAILED` if the transport throws. Provider error text is
not stored or logged by `convex-invite`.

Do not schedule the delivery action with a raw token argument. Scheduled
arguments are durable. Return the token directly from the internal mutation to
the action that sends it.

## Inject an existing Convex Resend client

Install and mount `@convex-dev/resend` in the host application. It remains an
application dependency:

```sh
bun add @convex-dev/resend convex-invite
```

```ts
// convex/convex.config.ts
import resend from "@convex-dev/resend/convex.config.js";
import { defineApp } from "convex/server";
import invite from "convex-invite/convex.config.js";

const app = defineApp();
app.use(invite);
app.use(resend);
export default app;
```

Create or reuse one Resend client. Then inject its `sendEmail()` method:

```ts
// convex/resend.ts
import {
  Resend,
  type EmailId,
  type SendEmailOptions,
} from "@convex-dev/resend";
import { Invitations } from "convex-invite";
import { components } from "./_generated/api";

export const resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE === "true",
});

const invitations = new Invitations(components.invite);

export const invitationDelivery = invitations.withDelivery<
  SendEmailOptions,
  EmailId
>({
  transport: "resend",
  enqueue: (ctx, message) => resend.sendEmail(ctx, message),
});
```

The same Resend client can send application emails, notifications, and
invitation emails.

## Use a Resend dashboard template

```ts
await invitationDelivery.deliver(ctx, {
  scope: args.scope,
  invitationId: args.invitationId,
  message: {
    from: "Acme <invites@example.com>",
    to: args.to,
    subject: "You are invited to Acme",
    template: {
      id: "workspace-invitation",
      variables: { inviteUrl },
    },
  },
});
```

## Use React Email

Keep the React Email component and render function in the host application:

```tsx
// packages/emails/render.tsx
import { render } from "@react-email/render";
import { ProjectInviteEmail } from "./emails/project-invite-email";

export async function renderProjectInviteEmail(props: {
  inviteUrl: string;
  projectName: string;
}) {
  return await render(<ProjectInviteEmail {...props} />);
}
```

Render the component inside a host Node action. Pass the HTML string to the
injected delivery helper:

```ts
// convex/invitationDelivery.ts
"use node";

import { renderProjectInviteEmail } from "@acme/emails";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { invitationDelivery } from "./resend";

export const sendProjectInvitation = internalAction({
  args: {
    scope: v.string(),
    invitationId: v.string(),
    token: v.string(),
    to: v.string(),
    projectName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const appOrigin = process.env.APP_ORIGIN;
    if (!appOrigin) throw new Error("Missing APP_ORIGIN");
    const inviteUrl = new URL(
      `/invitations/${args.token}`,
      appOrigin,
    ).toString();
    const html = await renderProjectInviteEmail({
      inviteUrl,
      projectName: args.projectName,
    });

    await invitationDelivery.deliver(ctx, {
      scope: args.scope,
      invitationId: args.invitationId,
      message: {
        from: "Acme <invites@example.com>",
        to: args.to,
        subject: `Invitation to ${args.projectName}`,
        html,
      },
    });
    return null;
  },
});
```

The renderer and `deliver()` are normal TypeScript calls inside the same action.
The HTML crosses a Convex component boundary only when the injected Resend
client queues it. The Resend component stores the message for durable delivery.

## Delivery events

`sendEmail()` confirms queueing. It does not confirm inbox delivery. Configure
the Resend webhook and `onEmailEvent` handler for sent, delivered, bounced, or
failed feedback. Store the returned `EmailId` in a host-owned mapping to the
invitation ID. Do not store a raw invitation token in that mapping.

The Resend component defaults to test mode. Set `testMode: false` only when the
sender domain and production configuration are ready. See the
[official Convex Resend documentation](https://github.com/get-convex/resend).

## Ownership boundary

The host owns recipients, message content, URLs, rendering, provider setup, and
authorization. `convex-invite` owns invitation state and safe delivery metadata.
