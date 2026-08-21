import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageDirectory = join(repositoryRoot, "packages/convex-invite");
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "convex-invite-package-"),
);

function run(command: string, args: string[], cwd = repositoryRoot) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function requiredTarget(
  exports: Record<string, unknown>,
  key: string,
  condition: "default" | "types" = "default",
) {
  const entry = exports[key];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const target = (entry as Record<string, unknown>)[condition];
    if (typeof target === "string") return target;
  }
  throw new Error(`Missing ${condition} export for ${key}`);
}

async function assertFile(packageRoot: string, target: string) {
  const path = join(packageRoot, target.replace(/^\.\//, ""));
  if (!(await stat(path).catch(() => undefined))?.isFile()) {
    throw new Error(`Published export target is missing: ${target}`);
  }
}

try {
  const packOutput = execFileSync(
    "npm",
    [
      "pack",
      packageDirectory,
      "--json",
      "--pack-destination",
      temporaryDirectory,
    ],
    { encoding: "utf8" },
  );
  const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;
  const tarball = join(temporaryDirectory, filename);
  run("tar", ["-xzf", tarball, "-C", temporaryDirectory]);

  const packageRoot = join(temporaryDirectory, "package");
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as {
    exports: Record<string, unknown>;
    name: string;
    publishConfig?: { tag?: string };
    version: string;
  };
  if (manifest.name !== "convex-invite") {
    throw new Error(`Unexpected package name: ${manifest.name}`);
  }
  const prerelease = manifest.version.includes("-");
  if (prerelease && manifest.publishConfig?.tag !== "next") {
    throw new Error("Prereleases must use the npm next tag");
  }
  if (!prerelease && manifest.publishConfig?.tag === "next") {
    throw new Error("Stable releases must not use the npm next tag");
  }

  for (const key of [".", "./convex.config.js", "./convex.config"]) {
    await assertFile(packageRoot, requiredTarget(manifest.exports, key));
    await assertFile(
      packageRoot,
      requiredTarget(manifest.exports, key, "types"),
    );
  }
  for (const key of ["./_generated/component.js", "./_generated/component"]) {
    await assertFile(
      packageRoot,
      requiredTarget(manifest.exports, key, "types"),
    );
  }
  await assertFile(packageRoot, requiredTarget(manifest.exports, "./test"));
  await assertFile(
    packageRoot,
    requiredTarget(manifest.exports, "./package.json"),
  );
  await assertFile(packageRoot, "LICENSE");
  await assertFile(packageRoot, "README.md");

  const archiveFiles = execFileSync("tar", ["-tzf", tarball], {
    encoding: "utf8",
  });
  if (/\.test\.[cm]?[jt]sx?$/m.test(archiveFiles)) {
    throw new Error("The package archive contains test files");
  }

  const consumerDirectory = join(temporaryDirectory, "consumer");
  await mkdir(join(consumerDirectory, "convex"), { recursive: true });
  await writeFile(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "convex-invite-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          convex: "1.43.0",
          "convex-invite": `file:${tarball}`,
        },
        devDependencies: {
          "@edge-runtime/vm": "5.0.0",
          "convex-test": "0.0.55",
          typescript: "7.0.2",
          vite: "8.2.1",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(consumerDirectory, "convex/convex.config.ts"),
    `import { defineApp } from "convex/server";
import invite from "convex-invite/convex.config.js";

const app = defineApp();
app.use(invite);
export default app;
`,
  );
  await writeFile(
    join(consumerDirectory, "smoke.ts"),
    `import type { GenericActionCtx, GenericDataModel, GenericMutationCtx } from "convex/server";
import type { GenericId } from "convex/values";
import { Invitations, invitationErrorCodes } from "convex-invite";
import inviteTest from "convex-invite/test";
import inviteConfig from "convex-invite/convex.config.js";
import type { ComponentApi } from "convex-invite/_generated/component.js";

type ConcreteHostDataModel = {
  memberships: {
    document: {
      _id: GenericId<"memberships">;
      _creationTime: number;
      subject: string;
    };
    fieldPaths: "_id" | "_creationTime" | "subject";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
    };
    searchIndexes: Record<never, never>;
    vectorIndexes: Record<never, never>;
  };
};

const component = null as unknown as ComponentApi;
const invitations = new Invitations(component);
declare const mutationCtx: GenericMutationCtx<ConcreteHostDataModel>;
declare const actionCtx: GenericActionCtx<GenericDataModel>;
void invitations.accept(mutationCtx, {
  token: "token",
  acceptedBy: "subject",
});
// @ts-expect-error Lifecycle writes must remain inside a mutation.
void invitations.accept(actionCtx, {
  token: "token",
  acceptedBy: "subject",
});
void invitations;
void invitationErrorCodes.invalidToken;
void inviteTest.register;
void inviteConfig;
`,
  );
  await writeFile(
    join(consumerDirectory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2023", "DOM"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ESNext",
        },
        include: ["convex/**/*.ts", "smoke.ts"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(consumerDirectory, "smoke.mjs"),
    `import { Invitations, invitationErrorCodes } from "convex-invite";
import inviteConfig from "convex-invite/convex.config.js";

if (typeof Invitations !== "function") process.exit(1);
if (typeof invitationErrorCodes.invalidToken !== "string") process.exit(1);
if (!inviteConfig) process.exit(1);
`,
  );

  run("bun", ["install", "--ignore-scripts"], consumerDirectory);
  run("bun", ["run", "tsc", "-p", "tsconfig.json"], consumerDirectory);
  run("bun", ["smoke.mjs"], consumerDirectory);

  console.log(
    `Verified ${filename}: archive exports, clean install, types, mounted config, and runtime imports pass.`,
  );
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
