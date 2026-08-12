# convex-invite

Secure, reusable, single-use invitation lifecycles for Convex.

`convex-invite` generates 256-bit bearer tokens, stores only versioned SHA-256
digests, and provides transactional issue, accept, decline, revoke, resend,
expiry, delivery, management, export, and pruning operations. Authentication,
authorization, transport, identifier verification, and application grants stay
in your application.

> `0.1.0-rc.1` is a release candidate. Install it through the npm `next` tag
> after publication. The public API can still change before `0.1.0`.

## Install and mount

```sh
bun add convex-invite@next
```

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import invite from "convex-invite/convex.config.js";

const app = defineApp();
app.use(invite);
export default app;
```

Multiple named mounts are isolated:

```ts
app.use(invite, { name: "customerInvites" });
app.use(invite, { name: "staffInvites" });
```

Run `bunx convex dev` after mounting so Convex generates the application's
component API.

## Create a host client

```ts
import { Invitations } from "convex-invite";
import { components } from "./_generated/api";

const invites = new Invitations(components.invite, {
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  terminalRetentionMs: 90 * 24 * 60 * 60 * 1000,
});
```

Optional `roleParser`, `payloadParser`, and `acceptanceResultParser` callbacks
can validate or normalize host values before they cross the component boundary.
The component independently enforces JSON depth, key-count, and 16 KiB limits.

## Secure integration pattern

Every exported host wrapper must authenticate and authorize its caller.
Issuance returns the raw token once. Do not log, persist, or place it in
scheduled-function arguments. A host delivery action can receive it directly
from an internal mutation:

```ts
export const issueForDelivery = internalMutation({
  args: { scope: v.string(), resourceRef: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const audienceRef = normalizeEmail(args.email);
    return await invites.issue(ctx, {
      scope: args.scope,
      resourceRef: args.resourceRef,
      audienceRef,
      dedupeKey: `${args.resourceRef}|${audienceRef}`,
    });
  },
});

export const issue = action({
  args: { scope: v.string(), resourceRef: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireAuthorizedManager(ctx, args.scope);
    const issued = await ctx.runMutation(internal.invites.issueForDelivery, args);
    await invitationDelivery.deliver(ctx, {
      scope: args.scope,
      invitationId: issued.invitationId,
      message: renderMessage(args.email, issued.token),
    });
    return { invitationId: issued.invitationId, expiresAt: issued.expiresAt };
  },
});
```

Acceptance and the host grant must run inside the same top-level mutation:

```ts
const grant = await invites.accept(ctx, {
  token,
  acceptedBy: identity.subject,
  audienceRef: verifiedNormalizedEmail(identity),
});

if (grant.acceptanceResult) return grant.acceptanceResult;
const membershipId = await ctx.db.insert("memberships", {
  subject: identity.subject,
  resourceRef: grant.resourceRef,
  role: grant.role,
});
await invites.setAcceptanceResult(ctx, {
  scope: grant.scope,
  invitationId: grant.invitationId,
  acceptedBy: identity.subject,
  result: { membershipId },
});
return { membershipId };
```

If any uncaught operation fails, Convex rolls back both component and host
writes. Do not accept from an action and then create the grant later.

See [the complete backend example](../../apps/example/convex/invites.ts) for verified
audience handling, idempotency, safe preview projection, management reads, and
host-owned delivery bookkeeping.

The example's delivery action posts `{ to, inviteUrl }` to a host-owned
`EMAIL_WEBHOOK_URL`; it does not bundle an email provider. See the
[delivery guide](../../docs/delivery.md) for the exact webhook contract and a
complete optional integration with `@convex-dev/resend`, including host-owned
templates and delivery-status guidance.

## Inject delivery

Reuse an existing provider client without adding it as a dependency of
`convex-invite`:

```ts
import type { EmailId, SendEmailOptions } from "@convex-dev/resend";

const delivery = invites.withDelivery<SendEmailOptions, EmailId>({
  transport: "resend",
  enqueue: (ctx, message) => resend.sendEmail(ctx, message),
});

await delivery.deliver(ctx, {
  scope,
  invitationId,
  message: { from, to, subject, html },
});
```

`deliver` records `queued` after `enqueue` succeeds. It records `failed` with a
safe error code if `enqueue` throws. It does not log or store provider error
text. Message rendering, recipients, templates, URLs, and provider setup remain
in host code. `issue` stays available without a delivery adapter; there is no
silent send operation when an adapter is absent.

## React acceptance

Expose only the safe host wrappers above, then use those from React:

```tsx
function AcceptInvitation({ token }: { token: string }) {
  const preview = useQuery(api.invites.preview, { token });
  const accept = useMutation(api.invites.accept);
  if (!preview) return <p>Loading invitation…</p>;
  return (
    <button onClick={() => void accept({ token })}>
      Accept invitation to {preview.resourceRef}
    </button>
  );
}
```

The page should use a strict `Referrer-Policy`, avoid third-party requests until
the URL token is scrubbed, and replace the token-bearing URL with
`history.replaceState` as soon as practical.

## API

Mutation methods:

- `issue`, `resolve`, `accept`, `setAcceptanceResult`, `decline`
- `revoke`, `resend`, `recordDeliveryAttempt`
- `prune`, `deleteByScope`

Query methods:

- `getEffectiveByToken`, `getById`
- `listByResource`, `listByState`, `listPendingByAudience`
- `exportByScope`

All list methods use Convex pagination and cap requested pages at 100 rows.
Pruning and deletion are bounded to 100 documents per call. Management results
never contain a token digest or raw token.

Errors are `ConvexError` values whose data contains a stable `code`. Import
`invitationErrorCodes` to map them to host copy. Public wrappers should collapse
codes where distinguishing them would enable enumeration.

## Development

```sh
bun install
bun run build
bun run test
bun run typecheck
bun run lint
bun run verify:package
```

`src/component/_generated` is committed so package builds are reproducible.
When changing component functions with a configured development deployment, run
`bun run --cwd packages/convex-invite build:codegen` and commit the generated
changes.
