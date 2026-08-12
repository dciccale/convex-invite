---
title: convex-invite v0.1 design proposal
description: Product requirements and implementation plan for a secure, reusable Convex invitation component.
date: 2026-08-12
status: RC HARDENING
target_version: 0.1.0
owner_repo: convex-invite
working_package_name: convex-invite
license_target: Apache-2.0
---

# Convex Invite Component v0.1 PRD and Implementation Plan

## Executive Decision

Build `convex-invite` as an independent open-source Convex component for secure,
single-use invitation lifecycles.

The component owns:

- high-entropy token creation and hash-only durable storage;
- pending, accepted, declined, expired, and revoked states;
- atomic resend-as-replacement with an explicit superseded reason;
- idempotent acceptance by the same subject;
- invitation lookup, management listings, expiry, and bounded retention;
- optional opaque resource, role, and payload data;
- optional invitee binding through an opaque audience reference; and
- delivery-attempt bookkeeping without sending email itself.

The host application owns:

- authentication and authorization;
- users, organizations, memberships, relationships, and other domain grants;
- normalization and verification of email addresses or other invitee identifiers;
- email, SMS, push, or link delivery;
- canonical URLs, sign-in/sign-up return paths, and user-facing acceptance UI;
- application-specific conflict and replacement policy; and
- applying the accepted grant inside the same top-level host mutation.

The first motivating integration is a coach inviting a client. The component
must remain neutral: it should also support workspace, project, household,
publication, beta-access, and collaborator invitations without learning those
domains.

`convex-invite` is the recommended working name. The unscoped npm name appeared
unclaimed on 2026-08-12, but availability is not ownership and must be checked
again immediately before repository publication or npm release.

## Why This Should Be a Component

Invitation flows repeatedly need the same security and concurrency decisions:

- bearer secrets must not be stored in plaintext;
- links must be single-use and expire consistently;
- accept, revoke, decline, expiry, and resend can race;
- retrying acceptance must not create a second grant;
- resending must invalidate the previous link without erasing its audit state;
- management screens must never receive a raw token;
- delivery failure must not accidentally create access; and
- the invitation state and the host's resulting domain grant must commit or
  roll back together.

A Convex component provides an isolated schema, runtime-validated API,
transactional nested mutations, reactive queries, and a package boundary in
which these invariants can be tested once.

## Ecosystem Decision

### `@vllnt/convex-invitations`

The existing community component validates the usefulness of a generic
invitation primitive. Its issue, accept, revoke, expiry, pagination, and pruning
APIs are useful design references.

It is not the implementation base for v0.1 because the inspected canary stores
and indexes the bearer token itself, returns that token in invitation views,
does not model decline or delivery state, and does not preserve a distinct
superseded invitation when resending. `convex-invite` may study its tests and API
ergonomics without copying its storage boundary.

### FeedTwin

FeedTwin demonstrates the preferred host pattern:

- generate a random token;
- store a SHA-256 digest;
- schedule delivery separately;
- match the authenticated verified email on acceptance; and
- reject expired or terminal invitations.

`convex-invite` must improve on that application-local reference by making the
state machine reusable, preserving the old invitation on resend, supporting
idempotent accepted retries, separating delivery bookkeeping, and testing races
at the component boundary.

### Convex transaction model

Nested component mutations participate in the calling top-level mutation.
Therefore a host mutation may accept an invitation, apply its own membership or
relationship grant, and attach the host result to the accepted invitation. If
any uncaught step fails, all component and host writes roll back.

Acceptance from an action is not atomic with later host writes and must not be
presented as the recommended integration.

## Goals

- Never durably store or return bearer tokens after issuance/resend.
- Make every terminal transition concurrency-safe and replay-safe.
- Support generic resource invitations without importing host schemas.
- Let hosts bind an invitation to a verified opaque audience reference.
- Make accepted retries by the same subject idempotent.
- Atomically supersede the old pending invitation when resending.
- Provide management reads by invitation ID and scope, never by recovered token.
- Track queued, sent, and failed delivery attempts without owning transport.
- Provide stable coded errors and complete runtime validators.
- Support multiple isolated named mounts.
- Ship deterministic component tests and a minimal host integration example.

## Non-Goals for 0.1

- Sending email, SMS, push notifications, or webhooks.
- Owning users, memberships, organizations, coach relationships, or billing.
- Reading host authentication from inside the component.
- Rendering invitation, authentication, onboarding, or acceptance UI.
- Discovering whether an email belongs to an application account.
- Performing email normalization or verification.
- Managing Clerk, Auth0, WorkOS, or other provider invitations.
- Public referral codes, coupons, waitlists, or unlimited-use invite links.
- Multi-use tokens, QR-code generation, short-link hosting, or URL shortening.
- Password reset, magic login, email verification, or API-key storage.
- Guaranteeing delivery or treating a successful invitation mutation as proof
  that a recipient received a message.

## Terminology

- **Scope**: opaque host tenancy/security partition.
- **Resource**: opaque host object to which acceptance may grant access.
- **Inviter**: opaque host subject that initiated the invitation.
- **Audience reference**: normalized, verified host identifier the invitee must
  prove, such as a normalized email. It is sensitive management data.
- **Accepted subject**: opaque authenticated host subject accepting the invite.
- **Grant**: opaque resource, role, and payload returned for the host to apply.
- **Token**: high-entropy bearer secret delivered out of band.
- **Token digest**: one-way SHA-256 digest stored and indexed by the component.
- **Delivery**: host-owned side effect; the component stores only attempt state.

## Ownership and Trust Model

### Component responsibilities

- Enforce scope on every ID-based read and write.
- Validate state transitions and terminal-state immutability.
- Generate at least 256 bits of token entropy using the supported Convex runtime.
- Return the raw token exactly from issue/resend and nowhere else.
- Store only a versioned digest and never persist the raw token.
- Compare audience references exactly after the host normalizes/verifies them.
- Enforce pending uniqueness through a host-provided dedupe key.
- Retain enough accepted state to answer same-subject retries.
- Bound listing, expiry, and deletion operations.

### Host responsibilities

- Authenticate every public wrapper.
- Authorize issue, list, revoke, resend, and delivery bookkeeping.
- Avoid placing raw tokens in logs, analytics, error messages, or durable browser
  storage.
- Normalize invitee identifiers before constructing audience/dedupe references.
- Verify the accepting subject owns the supplied audience reference.
- Apply the grant in the same top-level mutation as component acceptance.
- Schedule transport after issue/resend and record delivery outcomes separately.
- Decide which invitation fields are safe to show in public previews.

The component cannot make an insecure host wrapper safe. Documentation must
show secure wrappers before convenience examples.

## Functional Scope

### Issue

`issue` creates one pending invitation and returns `{ invitationId, token,
expiresAt }`.

- The token is generated server-side and returned once.
- Only its digest is stored.
- `expiresAt` defaults from configurable TTL and is server-sourced.
- A pending invitation with the same `(scope, dedupeKey)` produces
  `INVITATION_ALREADY_PENDING`.
- Role and payload are runtime-validated when host parsers are configured.
- Delivery begins as `queued` but is not performed by the component.

### Resolve and preview

The token-resolution API accepts the raw token, hashes it, and returns an
internal invitation view without returning the token or digest.

It may transition an overdue pending invitation to expired when called from a
mutation. A pure query variant reports effective expiry without writing.

Hosts build public previews from an allowlisted projection. Audience reference,
private payload, accepted subject, delivery errors, digest, and management IDs
are never safe public defaults.

### Accept

Acceptance requires the token, accepted subject, and—when the invitation is
bound—an audience reference already verified by the host.

- Pending and unexpired invitations may be accepted.
- Audience mismatch fails without revealing the expected value.
- First acceptance records the subject/time and returns the opaque grant.
- Retrying as the same subject returns the same accepted result.
- Retrying as another subject fails.
- Accepted invitations cannot be revoked, declined, expired, or resent.
- A host may attach an opaque acceptance result, such as a membership or
  relationship reference, inside the same top-level transaction.

### Decline

An authenticated, audience-matching invitee may decline a pending invitation.
Decline is terminal and does not apply the grant. A forwarded token without the
verified audience proof cannot invalidate the invitation.

### Revoke

Authorized hosts revoke by `{ scope, invitationId }`, never by recovering the
token. Revocation is terminal and records a bounded host-defined reason from an
allowlist plus time.

### Resend

Resend is one mutation that:

1. validates the old invitation is eligible;
2. creates a new pending invitation with a new token and expiry;
3. copies the approved resource, audience, role, payload, and dedupe data;
4. revokes the old invitation with `superseded_by_resend`; and
5. returns only the new `{ invitationId, token, expiresAt }`.

Concurrent resend/accept/revoke operations must have one serializable winner.
The old link can never become valid again.

### Delivery bookkeeping

Hosts may record delivery attempts by scope and invitation ID:

- `queued`: awaiting transport;
- `sent`: transport accepted the message; and
- `failed`: the attempt failed and may be retried.

Each attempt records server time, monotonic attempt number, transport kind, and
an optional bounded error code. It must not store provider response bodies,
recipient secrets, or raw tokens. Delivery failure never changes invitation
authority or acceptance eligibility unless host policy revokes it separately.

### Expiry, retention, and pruning

- Acceptance and resolve enforce TTL immediately.
- A bounded scheduled sweep materializes expired states for management queries.
- Terminal retention is configurable with a conservative default.
- Accepted records must be retained long enough for documented idempotent retry.
- Pruning uses indexed bounded batches and is safe across multiple mounts.
- The component exposes explicit deletion/export primitives for host privacy
  workflows without scanning unbounded data.

## Proposed Data Model

### `invitations`

```ts
{
  scope: string;
  resourceRef: string;
  inviterRef?: string;
  audienceRef?: string;
  dedupeKey: string;
  tokenDigest: string;
  tokenDigestVersion: 1;
  state: "pending" | "accepted" | "declined" | "expired" | "revoked";
  role?: JsonValue;
  payload?: JsonValue;
  acceptedBy?: string;
  acceptanceResult?: JsonValue;
  revokedReason?: "host_revoked" | "superseded_by_resend" | "inviter_disabled" | "resource_disabled";
  deliveryState: "queued" | "sent" | "failed";
  deliveryAttempts: number;
  lastDeliveryAttemptAt?: number;
  lastDeliveryTransport?: string;
  lastDeliveryErrorCode?: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  declinedAt?: number;
  expiredAt?: number;
  revokedAt?: number;
  updatedAt: number;
}
```

Required indexes cover token digest, `(scope, dedupeKey, state)`,
`(scope, resourceRef, state, createdAt)`, `(scope, state, createdAt)`, pending
expiry, and terminal retention. Exact index order must be validated against all
queries before schema lock.

An append-only delivery-attempt table may replace the summary-only fields if
the technical spike proves it remains bounded and materially improves retry
operations. V0.1 must not keep unbounded provider payload history.

## Proposed Server API

```ts
const invites = new Invitations(components.invite, {
  ttlMs,
  terminalRetentionMs,
  roleValidator?,
  payloadValidator?,
  acceptanceResultValidator?,
});
```

Mutation operations:

- `issue(ctx, input)`
- `resolve(ctx, { token })`
- `accept(ctx, { token, acceptedBy, audienceRef? })`
- `setAcceptanceResult(ctx, { scope, invitationId, acceptedBy, result })`
- `decline(ctx, { token, declinedBy, audienceRef? })`
- `revoke(ctx, { scope, invitationId, reason })`
- `resend(ctx, { scope, invitationId })`
- `recordDeliveryAttempt(ctx, input)`
- `prune(ctx, options?)`
- `deleteByScope(ctx, options)`

Query operations:

- `getEffectiveByToken(ctx, { token })`
- `getById(ctx, { scope, invitationId })`
- `listByResource(ctx, input, paginationOpts)`
- `listByState(ctx, input, paginationOpts)`
- `listPendingByAudience(ctx, input, paginationOpts)`

No list or ID-based management result includes token material or digest.
Component IDs cross the host boundary as strings.

## Core Invariants

1. Durable component data never contains a raw bearer token.
2. A token digest identifies at most one invitation.
3. At most one pending invitation exists per `(scope, dedupeKey)`.
4. Terminal states never transition back to pending.
5. Resend creates a new row and supersedes the old row atomically.
6. One invitation applies at most one semantic grant.
7. Same-subject acceptance retry is idempotent; different-subject retry fails.
8. A bound invitation accepts only after exact audience-reference match.
9. Delivery state never grants access.
10. Every ID-based operation verifies scope.
11. All timestamps and attempt counters are server-controlled.
12. Host grant application and acceptance are atomic only when composed inside
    one top-level host mutation.

## Error Model

Stable codes include:

- `INVITATION_NOT_FOUND`
- `INVITATION_ALREADY_PENDING`
- `INVITATION_EXPIRED`
- `INVITATION_ALREADY_ACCEPTED`
- `INVITATION_DECLINED`
- `INVITATION_REVOKED`
- `INVITATION_AUDIENCE_MISMATCH`
- `INVITATION_ACCEPTED_BY_ANOTHER_SUBJECT`
- `INVITATION_NOT_RESENDABLE`
- `INVITATION_SCOPE_MISMATCH`
- `INVITATION_INVALID_TRANSITION`
- `INVITATION_INVALID_TOKEN`
- `INVITATION_PAYLOAD_INVALID`

Errors must not contain the token, digest, expected audience, or private payload.
Hosts map codes to localized copy.

## Security and Privacy

- Generate at least 256 bits of entropy and encode with URL-safe base64 without
  padding.
- Store a versioned SHA-256 digest and compare indexed exact values.
- Never accept client-supplied timestamps, state, attempt count, or digest.
- Keep tokens out of logs, analytics, durable browser storage, and error text.
- Recommend URLs that avoid third-party requests before token scrubbing and use
  strict referrer policy on acceptance pages.
- Document that URL tokens can appear in browser history and infrastructure
  access logs unless hosts deliberately prevent it.
- Rate-limit public token resolution/acceptance in host wrappers.
- Return indistinguishable public errors where account enumeration is possible.
- Bound strings, JSON depth, payload bytes, page sizes, and retention work.
- Do not claim encryption, account verification, or transport security beyond
  the actual component boundary.

## Example Host Integration

The secure example must show:

1. an authenticated manager issues an invite;
2. the host schedules its own email action with the one-time raw token;
3. the delivery action records sent/failed without changing authority;
4. a public preview resolves the token and returns only allowlisted host data;
5. the host verifies the authenticated subject owns the invitation audience;
6. one host mutation calls `accept`, writes the membership/relationship, and
   stores the resulting reference;
7. retry returns the existing accepted outcome; and
8. resend invalidates the original link.

Examples must include React web acceptance and framework-neutral server use.
No styled UI kit is required.

## Implementation Plan

### Phase 0: repository and contract scaffolding

- Confirm repository/package name and license.
- Create package, example backend/app, CI, contribution, security, releasing,
  upgrading, and changelog structure following `convex-chat` conventions.
- Pin supported Convex and TypeScript versions.
- Define validators, errors, token format, and golden digest fixtures.

### Phase 1: secure token and lifecycle core

- Implement schema, token generation/digest, issue, resolve, expiry, accept,
  decline, and revoke.
- Test validators and every terminal transition.
- Prove plaintext tokens do not appear in stored documents or list results.

### Phase 2: resend, dedupe, and idempotency

- Implement pending uniqueness, resend-as-replacement, accepted retry, and
  acceptance result attachment.
- Add concurrent accept/resend/revoke/decline tests.
- Add a host mutation test proving grant and component rollback together.

### Phase 3: delivery and management reads

- Implement bounded delivery bookkeeping and reactive paginated management
  queries.
- Add safe projection helpers that exclude secrets by construction.
- Add retry and failed-delivery example workflows.

### Phase 4: retention, examples, and release hardening

- Implement bounded expiry/pruning, export, and deletion.
- Build minimal host example and security guidance.
- Benchmark indexes, sweeps, pagination, and concurrency.
- Verify npm tarball from an external consumer project.

## Test Plan

Component and property tests must cover:

- token entropy shape, digest golden vectors, and no plaintext persistence;
- duplicate issue under concurrency;
- accept versus accept by same and different subjects;
- accept versus resend, revoke, decline, and expiry races;
- exact audience match without enumeration leakage;
- resend creates a new row/token and permanently invalidates the old token;
- host grant failure rolls back component acceptance;
- accepted retry returns the same result;
- delivery retries never alter invitation authority;
- scope isolation on every management API;
- effective expiry before background sweep;
- bounded pruning and mount isolation;
- unknown/additive opaque payload validation; and
- package installation without repository-local imports.

The test suite should use `convex-test` against the real component runtime, not
mock the state machine.

## Acceptance Criteria for 0.1.0

- The package installs as a normal Convex component.
- Stored invitation documents contain a digest but never a raw token.
- Raw tokens are returned only from successful issue/resend.
- All five lifecycle states and resend supersession are implemented.
- Concurrent terminal operations produce one valid winner.
- Same-subject acceptance retry is idempotent.
- Audience-bound acceptance requires the host-verified exact reference.
- Management APIs are scope-safe and secret-free.
- Delivery retry is recoverable and independent from authority.
- Host acceptance and domain grant commit atomically in the documented pattern.
- Expiry and retention work is indexed and bounded.
- Runtime validators cover every argument and return value.
- Security, privacy, integration, upgrading, and release documentation exists.
- Lint, formatting, typecheck, tests, build, npm dry-run, and external tarball
  consumption pass in CI.

## Risks and Tradeoffs

### Hash-only storage limits token recovery

This is intentional. A lost raw token must be replaced through resend, not read
from the database.

### Host wrappers remain security-critical

The component cannot authenticate host users or verify email ownership. Secure
reference wrappers and tests are part of the product, not optional prose.

### Idempotent result retention costs storage

Returning the original accepted outcome requires retaining terminal records and
bounded result payloads. Defaults must favor correctness while allowing hosts to
choose a documented retention window.

### Generic payloads can become a dumping ground

Payload size is bounded and runtime validators are strongly recommended. The
component must not become an unversioned copy of host domain state.

### Delivery history can grow without bound

V0.1 keeps a compact summary or a strictly bounded attempt history. Transport
provider bodies and unlimited audit events are out of scope.

### Similar ecosystem naming

`convex-invite` and `@vllnt/convex-invitations` are distinct projects with
overlapping domains. Documentation must acknowledge the alternative and avoid
implying official Convex ownership or upstream affiliation.

## Explicit Decisions Before Coding

1. The working repository and package name is `convex-invite`.
2. The component stores only token digests.
3. Host authentication, delivery, and grants remain outside the component.
4. Resend always creates a new invitation and revokes the old one.
5. Decline is authenticated through host-verified audience binding.
6. Same-subject acceptance is idempotent.
7. Delivery state never becomes authorization state.
8. The recommended acceptance integration runs in a host mutation.
9. V0.1 targets single-use invitations, not reusable invite links.
10. The package ships backend primitives and examples, not a UI kit.

## Validated Public API Decisions

The RC technical spike resolves the original open questions:

1. Terminal records default to 90-day retention. Hosts can configure this
   value. Acceptance-result idempotency lasts while the terminal record exists.
2. V0.1 stores one compact delivery summary. It does not store an attempt table
   or provider message body.
3. The host calls `accept`, writes its domain grant, and calls
   `setAcceptanceResult` inside one top-level mutation. A higher-order helper
   cannot safely model every host grant.
4. Lifecycle write methods require `InvitationMutationContext`. This type
   includes the mutation database context and rejects action contexts at compile
   time. Delivery recording continues to support mutations and actions.
5. `dedupeKey` remains mandatory. The host owns its domain-specific uniqueness
   rule and must construct the key.
6. Public preview projection remains host-owned. The component does not define a
   second public payload.
7. V0.1 requires Convex 1.43.0 or newer. The RC gate tests that minimum version.

## Completed Technical Spike

Runtime and host integration tests prove:

1. issue and resend store only token digests;
2. delivery receives the raw token outside durable component storage;
3. two concurrent accepts create one host membership;
4. a failed host grant rolls component acceptance back;
5. retry by the same subject returns the original membership reference;
6. accept races with resend, revoke, and decline produce one terminal winner;
7. management reads and exports contain no token material;
8. expiry is effective before a sweep and materialized by resolve or prune; and
9. separate named component mounts do not share invitation data.

## Sources

- [Authoring Convex Components](https://docs.convex.dev/components/authoring)
- [Using Convex Components](https://docs.convex.dev/components/using)
- [Understanding Convex Components](https://docs.convex.dev/components/understanding)
- [Convex mutations and transactions](https://docs.convex.dev/functions/mutation-functions)
- [Community Convex Invitations component](https://github.com/vllnt/convex-invitations)
- Local references: `../convex-chat`, `../convex-eve`, and `../feedtwin`

## Final Product Statement

`convex-invite` is the secure invitation state machine for Convex applications.
It makes single-use tokens, terminal transitions, resend supersession,
idempotent acceptance, and delivery bookkeeping reusable while leaving identity,
transport, and domain authority with the host application.
