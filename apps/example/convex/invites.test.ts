/// <reference types="vite/client" />

import { componentsGeneric } from "convex/server";
import type { ComponentApi } from "convex-invite/_generated/component.js";
import { register } from "convex-invite/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const issueArgs = {
  scope: "workspace:acme",
  resourceRef: "project:launch",
  audienceRef: "client@example.com",
  dedupeKey: "project:launch|client@example.com",
  role: { name: "editor" },
  ttlMs: 60_000,
};

function initTest() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

function verifiedClient(t: ReturnType<typeof initTest>) {
  return t.withIdentity({
    subject: "user:client",
    email: "client@example.com",
    emailVerified: true,
  });
}

describe("host acceptance integration", () => {
  test("issues and records failed delivery without returning a token", async () => {
    const t = initTest();
    const manager = t.withIdentity({
      subject: "user:manager",
      canManageInvites: true,
    });
    const issued = await manager.action(api.delivery.issue, {
      scope: issueArgs.scope,
      resourceRef: issueArgs.resourceRef,
      audienceRef: issueArgs.audienceRef,
      role: issueArgs.role,
    });

    expect(issued).not.toHaveProperty("token");
    const page = await t.query(components.invite.invitations.listByState, {
      scope: issueArgs.scope,
      state: "pending",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({
      _id: issued.invitationId,
      deliveryState: "failed",
      deliveryAttempts: 1,
    });
  });

  test("concurrent accepts create one membership and return the same result", async () => {
    const t = initTest();
    const issued = await t.mutation(
      components.invite.invitations.issue,
      issueArgs,
    );
    const client = verifiedClient(t);

    const results = await Promise.all([
      client.mutation(api.invites.accept, { token: issued.token }),
      client.mutation(api.invites.accept, { token: issued.token }),
    ]);

    expect(results[1]).toEqual(results[0]);
    const memberships = await t.run(async (ctx) =>
      ctx.db.query("memberships").collect(),
    );
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?._id).toBe(results[0].membershipId);
  });

  test("host grant failure rolls component acceptance back", async () => {
    const t = initTest();
    const issued = await t.mutation(
      components.invite.invitations.issue,
      issueArgs,
    );
    await t.run(async (ctx) => {
      const membership = {
        scope: issueArgs.scope,
        resourceRef: issueArgs.resourceRef,
        subject: "user:client",
        role: issueArgs.role,
        invitationId: "existing-invitation",
        createdAt: Date.now(),
      };
      await ctx.db.insert("memberships", membership);
      await ctx.db.insert("memberships", membership);
    });

    await expect(
      verifiedClient(t).mutation(api.invites.accept, { token: issued.token }),
    ).rejects.toThrow();

    const invitation = await t.query(
      components.invite.invitations.getEffectiveByToken,
      { token: issued.token },
    );
    expect(invitation.state).toBe("pending");
  });

  test("keeps named component mounts isolated", async () => {
    const t = initTest();
    register(t, "secondaryInvite");
    const secondary = componentsGeneric() as unknown as {
      secondaryInvite: ComponentApi<"secondaryInvite">;
    };
    const issued = await t.mutation(
      components.invite.invitations.issue,
      issueArgs,
    );

    await expect(
      t.query(secondary.secondaryInvite.invitations.getEffectiveByToken, {
        token: issued.token,
      }),
    ).rejects.toMatchObject({
      data: { code: "INVITATION_INVALID_TOKEN" },
    });
  });
});
