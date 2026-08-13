# Releasing

## Repair the legacy npm placeholder

The original `convex-invite@0.0.0` name-reservation package is explicitly
unlicensed. Socket rejects that version even though the implemented release
candidate is clean. Publish the release-only `0.0.1` placeholder once so npm
`latest` has Apache-2.0 metadata while the component remains on `next`:

1. Run `npm pack --dry-run --json` from `release/npm-placeholder`.
2. Confirm that the archive contains only `index.js`, `LICENSE`, `README.md`,
   and `package.json`.
3. Run `npm publish` from `release/npm-placeholder` with an authenticated npm
   maintainer session.
4. Confirm that npm `latest` points to `0.0.1` and `next` still points to
   `0.1.0-rc.1`.
5. Wait for Socket to analyze both versions. Confirm that the RC has no alerts
   before asking Convex to review the submission again.

Do not move a prerelease to npm `latest`.

## Publish a release candidate

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
