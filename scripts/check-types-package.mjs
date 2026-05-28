import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { checkPackage, Package } from "@arethetypeswrong/core";

const packOutput = execFileSync("npm", ["pack", "--json", "--silent"], {
  encoding: "utf8",
});
const jsonStart = packOutput.search(/\[\s*\{/);

if (jsonStart === -1) {
  throw new Error("npm pack did not return JSON output");
}

const [pack] = JSON.parse(packOutput.slice(jsonStart));
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const packageRoot = `/node_modules/${manifest.name}`;

try {
  const files = Object.fromEntries(
    pack.files.map((file) => [
      `${packageRoot}/${file.path}`,
      readFileSync(join(process.cwd(), file.path)),
    ]),
  );
  const analysis = await checkPackage(
    new Package(files, manifest.name, manifest.version),
  );
  const hasProblem = analysis.problems.some(
    (problem) =>
      !("resolutionKind" in problem) ||
      !["node10", "node16-cjs"].includes(problem.resolutionKind),
  );

  if (hasProblem) {
    process.exitCode = 1;
  }
} finally {
  unlinkSync(pack.filename);
}
