/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { digestToken } from "./security.js";
import { initConvexTest } from "./setup.test.js";

const now = Date.UTC(2026, 7, 12, 12, 0, 0);
const ttlMs = 60_000;

const baseIssue = {
  scope: "workspace:acme",
  resourceRef: "project:launch",
  inviterRef: "user:manager",
  audienceRef: "client@example.com",
  dedupeKey: "project:launch|client@example.com",
  role: { name: "editor" },
  payload: { onboarding: true },
  ttlMs,
};

describe("invitation lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  test("uses a stable SHA-256 digest vector", async () => {
    expect(await digestToken("A".repeat(43))).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });

  test("issues a 256-bit token and never returns or stores it as plaintext", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await t.run(async (ctx) =>
      ctx.db.query("invitations").unique(),
    );
    expect(stored?.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(issued.token);

    const managed = await t.query(api.invitations.getByIdForManagement, {
      scope: baseIssue.scope,
      invitationId: issued.invitationId,
    });
    expect(managed).not.toHaveProperty("tokenDigest");
    expect(managed).not.toHaveProperty("tokenDigestVersion");
  });

  test("enforces one pending invitation per scope and dedupe key", async () => {
    const t = initConvexTest();
    await t.mutation(api.invitations.issue, baseIssue);
    await expect(
      t.mutation(api.invitations.issue, baseIssue),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_ALREADY_PENDING" },
    });
  });

  test("requires exact audience proof and accepts idempotently", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    await expect(
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:client",
        audienceRef: "other@example.com",
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_AUDIENCE_MISMATCH" },
    });

    const accepted = await t.mutation(api.invitations.accept, {
      token: issued.token,
      acceptedBy: "user:client",
      audienceRef: baseIssue.audienceRef,
    });
    const retried = await t.mutation(api.invitations.accept, {
      token: issued.token,
      acceptedBy: "user:client",
    });
    expect(retried).toEqual(accepted);
    await expect(
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:attacker",
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_ACCEPTED_BY_ANOTHER_SUBJECT" },
    });
  });

  test("attaches one idempotent host acceptance result", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    await t.mutation(api.invitations.accept, {
      token: issued.token,
      acceptedBy: "user:client",
      audienceRef: baseIssue.audienceRef,
    });
    const input = {
      scope: baseIssue.scope,
      invitationId: issued.invitationId,
      acceptedBy: "user:client",
      result: {
        membershipRef: "membership:123",
        metadata: { source: "invitation", permissions: ["read", "write"] },
      },
    };
    const first = await t.mutation(api.invitations.setAcceptanceResult, input);
    const retry = await t.mutation(api.invitations.setAcceptanceResult, {
      ...input,
      result: {
        metadata: { permissions: ["read", "write"], source: "invitation" },
        membershipRef: "membership:123",
      },
    });
    expect(retry.acceptanceResult).toEqual(first.acceptanceResult);
    await expect(
      t.mutation(api.invitations.setAcceptanceResult, {
        ...input,
        result: { membershipRef: "membership:other" },
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_INVALID_TRANSITION" },
    });
  });

  test("allows one concurrent issue for a scope and dedupe key", async () => {
    const t = initConvexTest();
    const results = await Promise.allSettled([
      t.mutation(api.invitations.issue, baseIssue),
      t.mutation(api.invitations.issue, baseIssue),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      reason: { data: { code: "INVITATION_ALREADY_PENDING" } },
    });
    const stored = await t.run(async (ctx) =>
      ctx.db.query("invitations").collect(),
    );
    expect(stored).toHaveLength(1);
  });

  test("accepts concurrent retries by the same subject idempotently", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    const input = {
      token: issued.token,
      acceptedBy: "user:client",
      audienceRef: baseIssue.audienceRef,
    };
    const results = await Promise.all([
      t.mutation(api.invitations.accept, input),
      t.mutation(api.invitations.accept, input),
    ]);
    expect(results[1]).toEqual(results[0]);
  });

  test("allows one winner when different subjects accept concurrently", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, {
      ...baseIssue,
      audienceRef: undefined,
    });
    const results = await Promise.allSettled([
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:one",
      }),
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:two",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure).toMatchObject({
      reason: {
        data: { code: "INVITATION_ACCEPTED_BY_ANOTHER_SUBJECT" },
      },
    });
  });

  test.each([
    ["resend", "INVITATION_NOT_RESENDABLE"],
    ["revoke", "INVITATION_ALREADY_ACCEPTED"],
    ["decline", "INVITATION_ALREADY_ACCEPTED"],
  ] as const)(
    "allows one terminal winner when accept races %s",
    async (operation, acceptWinnerCode) => {
      const t = initConvexTest();
      const issued = await t.mutation(api.invitations.issue, baseIssue);
      const accept = t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:client",
        audienceRef: baseIssue.audienceRef,
      });
      const competitor =
        operation === "resend"
          ? t.mutation(api.invitations.resend, {
              scope: baseIssue.scope,
              invitationId: issued.invitationId,
              ttlMs,
            })
          : operation === "revoke"
            ? t.mutation(api.invitations.revoke, {
                scope: baseIssue.scope,
                invitationId: issued.invitationId,
                reason: "host_revoked",
              })
            : t.mutation(api.invitations.decline, {
                token: issued.token,
                declinedBy: "user:client",
                audienceRef: baseIssue.audienceRef,
              });
      const results = await Promise.allSettled([accept, competitor]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);

      const failure = results.find((result) => result.status === "rejected");
      expect(failure?.status).toBe("rejected");
      if (failure?.status === "rejected") {
        expect([
          acceptWinnerCode,
          operation === "resend"
            ? "INVITATION_REVOKED"
            : operation === "revoke"
              ? "INVITATION_REVOKED"
              : "INVITATION_DECLINED",
        ]).toContain(failure.reason.data.code);
      }
    },
  );

  test("decline is audience-bound and terminal", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    const declined = await t.mutation(api.invitations.decline, {
      token: issued.token,
      declinedBy: "user:client",
      audienceRef: baseIssue.audienceRef,
    });
    expect(declined.state).toBe("declined");
    await expect(
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:client",
        audienceRef: baseIssue.audienceRef,
      }),
    ).rejects.toMatchObject({ data: { code: "INVITATION_DECLINED" } });
  });

  test("resend atomically supersedes the old token", async () => {
    const t = initConvexTest();
    const old = await t.mutation(api.invitations.issue, baseIssue);
    const replacement = await t.mutation(api.invitations.resend, {
      scope: baseIssue.scope,
      invitationId: old.invitationId,
      ttlMs,
    });
    expect(replacement.invitationId).not.toEqual(old.invitationId);
    expect(replacement.token).not.toEqual(old.token);

    const superseded = await t.query(api.invitations.getEffectiveByToken, {
      token: old.token,
    });
    expect(superseded).toMatchObject({
      state: "revoked",
      revokedReason: "superseded_by_resend",
    });
    expect(
      await t.query(api.invitations.getEffectiveByToken, {
        token: replacement.token,
      }),
    ).toMatchObject({ state: "pending" });
  });

  test("delivery attempts never change invitation authority", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    const failed = await t.mutation(api.invitations.recordDeliveryAttempt, {
      scope: baseIssue.scope,
      invitationId: issued.invitationId,
      state: "failed",
      transport: "email",
      errorCode: "TEMPORARY",
    });
    const sent = await t.mutation(api.invitations.recordDeliveryAttempt, {
      scope: baseIssue.scope,
      invitationId: issued.invitationId,
      state: "sent",
      transport: "email",
    });
    expect(failed.state).toBe("pending");
    expect(sent).toMatchObject({
      state: "pending",
      deliveryState: "sent",
      deliveryAttempts: 2,
    });
  });

  test("enforces scope isolation on management operations", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    await expect(
      t.query(api.invitations.getByIdForManagement, {
        scope: "workspace:other",
        invitationId: issued.invitationId,
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_SCOPE_MISMATCH" },
    });
    await expect(
      t.mutation(api.invitations.resend, {
        scope: "workspace:other",
        invitationId: issued.invitationId,
        ttlMs,
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_SCOPE_MISMATCH" },
    });
    await expect(
      t.mutation(api.invitations.revoke, {
        scope: "workspace:other",
        invitationId: issued.invitationId,
        reason: "host_revoked",
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_SCOPE_MISMATCH" },
    });
    await expect(
      t.mutation(api.invitations.recordDeliveryAttempt, {
        scope: "workspace:other",
        invitationId: issued.invitationId,
        state: "sent",
        transport: "email",
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_SCOPE_MISMATCH" },
    });

    const paginationOpts = { numItems: 10, cursor: null };
    expect(
      await t.query(api.invitations.listByResource, {
        scope: "workspace:other",
        resourceRef: baseIssue.resourceRef,
        state: "pending",
        paginationOpts,
      }),
    ).toMatchObject({ page: [] });
    expect(
      await t.query(api.invitations.listByState, {
        scope: "workspace:other",
        state: "pending",
        paginationOpts,
      }),
    ).toMatchObject({ page: [] });
    expect(
      await t.query(api.invitations.listPendingByAudience, {
        scope: "workspace:other",
        audienceRef: baseIssue.audienceRef,
        paginationOpts,
      }),
    ).toMatchObject({ page: [] });
    expect(
      await t.query(api.invitations.exportByScope, {
        scope: "workspace:other",
      }),
    ).toEqual([]);
    expect(
      await t.mutation(api.invitations.deleteByScope, {
        scope: "workspace:other",
      }),
    ).toEqual({ deleted: 0, hasMore: false });

    const exported = await t.query(api.invitations.exportByScope, {
      scope: baseIssue.scope,
    });
    expect(JSON.stringify(exported)).not.toContain(issued.token);
  });

  test("validates opaque role and payload values", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, {
      ...baseIssue,
      role: { version: 1, permissions: ["read"] },
      payload: { version: 2, custom: { enabled: true } },
    });
    expect(issued.invitationId).toBeTypeOf("string");

    await expect(
      t.mutation(api.invitations.issue, {
        ...baseIssue,
        dedupeKey: "invalid-payload",
        payload: { invalid: BigInt(1) },
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_PAYLOAD_INVALID" },
    });
  });

  test("reports effective expiry and materializes it during resolve", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    vi.setSystemTime(now + ttlMs + 1);
    const effective = await t.query(api.invitations.getEffectiveByToken, {
      token: issued.token,
    });
    expect(effective.state).toBe("expired");
    const resolved = await t.mutation(api.invitations.resolve, {
      token: issued.token,
    });
    expect(resolved.state).toBe("expired");
    const stored = await t.run(async (ctx) =>
      ctx.db.get("invitations", issued.invitationId),
    );
    expect(stored?.state).toBe("expired");
  });

  test("expiry wins when acceptance reaches an overdue invitation", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    vi.setSystemTime(now + ttlMs + 1);
    const results = await Promise.allSettled([
      t.mutation(api.invitations.accept, {
        token: issued.token,
        acceptedBy: "user:client",
        audienceRef: baseIssue.audienceRef,
      }),
      t.mutation(api.invitations.prune, {
        terminalRetentionMs: ttlMs,
        limit: 1,
      }),
    ]);
    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: { data: { code: "INVITATION_EXPIRED" } },
    });
    expect(results[1]).toMatchObject({ status: "fulfilled" });
    const stored = await t.run(async (ctx) =>
      ctx.db.get("invitations", issued.invitationId),
    );
    expect(stored?.state).toBe("expired");
  });

  test("prunes in bounded batches", async () => {
    const t = initConvexTest();
    const issued = await t.mutation(api.invitations.issue, baseIssue);
    await t.mutation(api.invitations.revoke, {
      scope: baseIssue.scope,
      invitationId: issued.invitationId,
      reason: "host_revoked",
    });
    vi.setSystemTime(now + ttlMs + 1);
    const result = await t.mutation(api.invitations.prune, {
      terminalRetentionMs: ttlMs,
      limit: 1,
    });
    expect(result).toEqual({ expired: 0, deleted: 1 });
  });
});
