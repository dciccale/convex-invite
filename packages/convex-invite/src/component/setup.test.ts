/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { test } from "vitest";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.*s");

// biome-ignore lint/suspicious/noExportsInTest: lifecycle tests share this real runtime harness.
export function initConvexTest() {
  return convexTest(schema, modules);
}

test("test harness initializes", () => {});
