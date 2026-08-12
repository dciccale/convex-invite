# Contributor guidance

- Use Bun workspaces and Turborepo for all repository tasks.
- Use Biome for formatting and linting.
- The publishable component lives in `packages/convex-invite`.
- Runnable examples and documentation sites live in `apps`.
- Keep authentication, authorization, delivery, and domain grants in host code.
- Never persist or log raw invitation tokens.
- Add component-runtime tests for every lifecycle or security change.
