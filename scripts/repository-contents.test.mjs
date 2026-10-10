import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

describe("repository contents", () => {
  it("keeps generated/local agent docs out of the pushed repository", () => {
    const result = spawnSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    const trackedFiles = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    assert.ok(trackedFiles.length > 30, "git ls-files must return tracked repository files");
    assert.equal(trackedFiles.includes("AGENTS.md"), false);
    assert.equal(trackedFiles.includes("AGENTPAY_CONCEPT.md"), false);
    assert.equal(trackedFiles.includes("apps/setup-web/PRODUCT.md"), false);
    assert.equal(trackedFiles.some((file) => file.startsWith("docs/")), false);
    assert.equal(
      trackedFiles.some((file) => /(^|\/)(?:.*concept.*|PRODUCT\.md)$/i.test(file)),
      false,
    );
  });

  it("keeps legacy files (celo, agentpay, ops, tsbuildinfo) out of the repository", () => {
    const result = spawnSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0);

    const trackedFiles = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    assert.ok(trackedFiles.length > 30, "git ls-files must return tracked repository files");
    const legacyPattern = /(?:celo|agentpay|^ops\/|\.tsbuildinfo$)/i;
    const legacyFiles = trackedFiles.filter((file) => legacyPattern.test(file));

    assert.deepEqual(
      legacyFiles,
      [],
      `Found legacy files in git index:\n${legacyFiles.join("\n")}`,
    );
  });

  it("Issue #18 & #36: guards demo script against raw private key signing bypass", () => {
    const DEMO_SCRIPT = path.join(repoRoot, "scripts/demo-monad-plugin.ts");
    assert.ok(fs.existsSync(DEMO_SCRIPT), `missing ${DEMO_SCRIPT}`);
    const content = fs.readFileSync(DEMO_SCRIPT, "utf8");
    assert.ok(content.length > 500, "demo script unexpectedly short — guard would pass vacuously");

    const FORBIDDEN_IN_DEMO = [
      "privateKeyToAccount",
      "sendTransaction",
      "MONAD_TESTNET_PRIVATE_KEY",
      "createWalletClient",
    ];

    for (const needle of FORBIDDEN_IN_DEMO) {
      assert.equal(
        content.includes(needle),
        false,
        `scripts/demo-monad-plugin.ts must not contain ${needle} (bypasses MetaMask Agent Wallet)`
      );
    }
  });
});
