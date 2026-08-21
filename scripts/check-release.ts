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

const stableVersion = /^\d+\.\d+\.\d+$/;
const releaseCandidateVersion = /^\d+\.\d+\.\d+-rc\.\d+$/;

if (
  !stableVersion.test(manifest.version) &&
  !releaseCandidateVersion.test(manifest.version)
) {
  throw new Error("The version must match x.y.z or x.y.z-rc.n");
}

if (
  releaseCandidateVersion.test(manifest.version) &&
  manifest.publishConfig?.tag !== "next"
) {
  throw new Error("An RC must publish to the npm next tag");
}

if (
  stableVersion.test(manifest.version) &&
  manifest.publishConfig?.tag !== undefined &&
  manifest.publishConfig.tag !== "latest"
) {
  throw new Error("A stable release must publish to the npm latest tag");
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
