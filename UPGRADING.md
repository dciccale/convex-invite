# Upgrading

## 0.1.0-rc.1

This is the first functional release candidate. It replaces the `0.0.0`
placeholder and is available through the npm `next` tag after publication.

Before upgrading a deployed mount:

1. Read `CHANGELOG.md` and deploy to a non-production Convex deployment.
2. Install `convex-invite@next` and run `bunx convex dev` so the generated
   component API is refreshed.
3. Verify host wrappers authenticate, authorize, and normalize audiences.
4. Exercise issue, resend, acceptance retry, delivery failure, and pruning.
5. Keep the configured terminal retention longer than the application's
   documented acceptance-idempotency window.

Future migrations that change stored documents will be documented here with a
bounded migration and rollback procedure.
