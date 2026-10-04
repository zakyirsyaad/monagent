import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

describe("repository contents", () => {
  it("keeps generated/local agent docs out of the pushed repository", () => {
    const result = spawnSync("git", ["ls-files"], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    const trackedFiles = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

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
      encoding: "utf8",
    });
    assert.equal(result.status, 0);

    const trackedFiles = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const legacyPattern = /(?:celo|agentpay|^ops\/|\.tsbuildinfo$)/i;
    const legacyFiles = trackedFiles.filter((file) => legacyPattern.test(file));

    assert.deepEqual(
      legacyFiles,
      [],
      `Found legacy files in git index:\n${legacyFiles.join("\n")}`,
    );
  });
});
