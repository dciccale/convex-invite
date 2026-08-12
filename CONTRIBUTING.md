# Contributing

Open an issue before large contract changes. Keep authentication, transport, and
domain grants outside the component boundary. New lifecycle behavior must include
`convex-test` coverage for terminal-state and concurrency invariants.

Run `bun run check` and `bun run verify:package` before submitting a pull request.
Never commit deployments, environment files, real audience identifiers, or raw
invitation tokens. Contributions are licensed under the Apache License 2.0 in
[`packages/convex-invite/LICENSE`](./packages/convex-invite/LICENSE).
