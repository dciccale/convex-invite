# Secure host integration example

This is a complete backend integration example for the invitation lifecycle:

1. `delivery.issue` authenticates a manager.
2. It calls `invites.issueForDelivery` and receives the raw token in memory.
3. It posts `{ to, inviteUrl }` to the host-owned `EMAIL_WEBHOOK_URL` without
   placing the token in scheduled-function arguments.
4. `invites.preview` exposes an allowlisted public projection.
5. `invites.accept` verifies the signed-in user's email and creates the
   membership in the same transaction as acceptance.
6. `decline`, `revoke`, `delivery.resend`, and `listPending` show the remaining
   lifecycle and management wrappers. Resend rotates and sends the replacement
   link from one action.

## What sends the email?

The checked-in example does **not** include an email provider. It makes a real
HTTP request to `EMAIL_WEBHOOK_URL`; the service at that URL must render and
send the email. A `2xx` response is recorded as `queued`, while a missing URL or
non-`2xx` response is recorded as `failed`. For example, the webhook receives:

```json
{
  "to": "invitee@example.com",
  "inviteUrl": "https://app.example.com/invitations/<raw-token>"
}
```

The raw token is passed only through the delivery boundary. The webhook must
not log or persist it beyond what its email delivery provider requires.

For a provider-complete alternative using the official Convex Resend
component, see [the delivery guide](../../docs/delivery.md).

The example injects its webhook function through `invites.withDelivery()`.
That helper calls the transport and records the safe delivery result. The same
API accepts an existing Resend client or another provider.

Before adapting this example, replace the authorization claim, application
URL, email normalization policy, and webhook transport with host-specific
implementations.
