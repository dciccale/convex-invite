# Releasing

1. Recheck ownership of the `convex-invite` npm name and npm session.
2. Use a SemVer prerelease version such as `0.1.0-rc.1`.
3. Set `publishConfig.tag` to `next`. Never publish an RC to `latest`.
4. Run `bun install --frozen-lockfile`.
5. Run `bun run check`, `bun audit --audit-level=high`, and
   `bun run verify:package`.
6. Use a configured staging deployment to run `bunx convex dev` against the
   packed component before the first RC.
7. Run `bun run release:check` from the exact clean commit.
8. Publish with `npm publish --provenance --tag next` from
   `packages/convex-invite`.
9. Confirm that npm `next` points to the RC and `latest` still points to the
   placeholder.
10. Tag the exact commit and create prerelease notes.

Do not release from a dirty working tree or with an unreviewed generated
component API.
