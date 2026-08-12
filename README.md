# convex-invite

Secure, reusable invitation lifecycles for Convex applications.

This repository is a Bun workspace managed with Turborepo and Biome.

## Workspace

- [`packages/convex-invite`](./packages/convex-invite) — publishable Convex component and typed host client.
- [`apps/example`](./apps/example) — secure host integration with delivery and atomic membership creation.
- [`apps/web`](./apps/web) — product site and documentation.
- [`docs/delivery.md`](./docs/delivery.md) — delivery ownership, the example webhook contract, and an optional `@convex-dev/resend` integration.

## Development

```sh
bun install
bun run dev:web
bun run check
bun run verify:package
```

The component owns hash-only invitation tokens and the invitation state machine.
Host applications retain authentication, authorization, audience verification,
delivery, and domain grants.
