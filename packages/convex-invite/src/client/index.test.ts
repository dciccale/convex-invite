import type {
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  DEFAULT_DELIVERY_FAILURE_CODE,
  type InvitationDeliveryContext,
  Invitations,
} from "./index.js";

const recordDeliveryAttempt = {} as FunctionReference<"mutation", "internal">;
const component = {
  invitations: { recordDeliveryAttempt },
} as unknown as ComponentApi;

describe("injected invitation delivery", () => {
  test("requires a mutation context for lifecycle writes", () => {
    expectTypeOf<GenericActionCtx<GenericDataModel>>().not.toMatchTypeOf<
      Parameters<Invitations["accept"]>[0]
    >();
  });

  test("queues the provider message before recording the queued attempt", async () => {
    const calls: string[] = [];
    const runMutation = vi.fn(async () => {
      calls.push("record");
      return {};
    });
    const ctx = { runMutation } as unknown as InvitationDeliveryContext;
    const invitations = new Invitations(component);
    const delivery = invitations.withDelivery<{ html: string }, string>({
      transport: "resend",
      enqueue: async (_ctx, message) => {
        calls.push(`enqueue:${message.html}`);
        return "email:123";
      },
    });

    const result = await delivery.deliver(ctx, {
      scope: "workspace:acme",
      invitationId: "invitation:123",
      message: { html: "<p>Invitation</p>" },
    });

    expect(result).toEqual({ state: "queued", messageId: "email:123" });
    expect(calls).toEqual(["enqueue:<p>Invitation</p>", "record"]);
    expect(runMutation).toHaveBeenCalledWith(recordDeliveryAttempt, {
      scope: "workspace:acme",
      invitationId: "invitation:123",
      state: "queued",
      transport: "resend",
    });
  });

  test("records a safe failure code without exposing the provider error", async () => {
    const runMutation = vi.fn(async () => ({}));
    const ctx = { runMutation } as unknown as InvitationDeliveryContext;
    const invitations = new Invitations(component);
    const delivery = invitations.withDelivery<{ html: string }, string>({
      transport: "resend",
      enqueue: async () => {
        throw new Error("secret provider response");
      },
    });

    const result = await delivery.deliver(ctx, {
      scope: "workspace:acme",
      invitationId: "invitation:123",
      message: { html: "<p>Invitation</p>" },
    });

    expect(result).toEqual({ state: "failed" });
    expect(runMutation).toHaveBeenCalledWith(recordDeliveryAttempt, {
      scope: "workspace:acme",
      invitationId: "invitation:123",
      state: "failed",
      transport: "resend",
      errorCode: DEFAULT_DELIVERY_FAILURE_CODE,
    });
    expect(JSON.stringify(runMutation.mock.calls)).not.toContain(
      "secret provider response",
    );
  });

  test("rejects invalid metadata before a provider can run", () => {
    const invitations = new Invitations(component);
    const enqueue = vi.fn(async () => "email:123");

    expect(() => invitations.withDelivery({ transport: "", enqueue })).toThrow(
      "transport must contain between 1 and 64 characters",
    );
    expect(enqueue).not.toHaveBeenCalled();
  });
});
