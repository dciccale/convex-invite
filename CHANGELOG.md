# Changelog

## 0.1.0-rc.1 - 2026-08-13

- Add hash-only 256-bit invitation tokens and all five lifecycle states.
- Add audience-bound, same-subject-idempotent acceptance.
- Add atomic resend replacement and dedupe enforcement.
- Add delivery summaries, paginated management reads, expiry, export, bounded
  pruning, and scope deletion.
- Add provider-neutral delivery injection with automatic queued and failed
  attempt recording.
- Add typed host client, real component tests, secure host example, and security
  documentation.
- Add concurrent lifecycle, host rollback, mount isolation, and packed-consumer
  release tests.

This release uses the npm `next` tag. The public API can still change before
`0.1.0`.
