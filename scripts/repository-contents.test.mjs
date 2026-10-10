import assert from "node:assert/strict";
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

  it("Issue #18: guards demo script against raw private key signing bypass", () => {
    const content = spawnSync("cat", ["scripts/demo-monad-plugin.ts"], { encoding: "utf8" }).stdout;

    assert.equal(
      content.includes("privateKeyToAccount"),
      false,
      "scripts/demo-monad-plugin.ts must not contain privateKeyToAccount (bypasses MetaMask Agent Wallet)"
    );
    assert.equal(
      content.includes("sendTransaction"),
      false,
      "scripts/demo-monad-plugin.ts must not contain direct walletClient.sendTransaction broadcast"
    );
  });
});
