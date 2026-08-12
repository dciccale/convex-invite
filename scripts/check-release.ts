import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "packages/convex-invite/package.json"),
    "utf8",
  ),
) as { publishConfig?: { tag?: string }; version: string };

if (!/^\d+\.\d+\.\d+-rc\.\d+$/.test(manifest.version)) {
  throw new Error("The RC version must match x.y.z-rc.n");
}
if (manifest.publishConfig?.tag !== "next") {
  throw new Error("An RC must publish to the npm next tag");
}

const status = execFileSync("git", ["status", "--porcelain"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (status.trim() !== "") {
  throw new Error("Release checks require a clean Git working tree");
}

console.log(
  `Release metadata and clean-tree checks pass for ${manifest.version}.`,
);
