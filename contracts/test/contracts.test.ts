import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

interface ForgeArtifact {
  abi: unknown[];
  bytecode: { object: string };
}

describe("Monad Smart Contracts Artifacts & ABI Verification", () => {
  const rootDir = process.cwd();

  it("verifies MonadAgentRegistry compilation artifact", (t) => {
    const artifactPath = join(
      rootDir,
      "contracts/out/MonadAgentRegistry.sol/MonadAgentRegistry.json"
    );
    if (!existsSync(artifactPath)) {
      t.skip("contracts/out not found; run `(cd contracts && forge build)` to compile");
      return;
    }
    const content = JSON.parse(readFileSync(artifactPath, "utf8")) as ForgeArtifact;

    assert.ok(content.bytecode.object.length > 100, "Bytecode should be generated");

    const functionNames = (content.abi as Array<{ name?: string }>)
      .map((item) => item.name)
      .filter(Boolean);

    assert.ok(functionNames.includes("registerAgent"), "Should export registerAgent");
    assert.ok(functionNames.includes("giveFeedback"), "Should export giveFeedback");
    assert.ok(functionNames.includes("getSummary"), "Should export getSummary");
    assert.ok(functionNames.includes("getAgent"), "Should export getAgent");
  });

  it("verifies MonadA2AEscrow compilation artifact", (t) => {
    const artifactPath = join(
      rootDir,
      "contracts/out/MonadA2AEscrow.sol/MonadA2AEscrow.json"
    );
    if (!existsSync(artifactPath)) {
      t.skip("contracts/out not found; run `(cd contracts && forge build)` to compile");
      return;
    }
    const content = JSON.parse(readFileSync(artifactPath, "utf8")) as ForgeArtifact;

    assert.ok(content.bytecode.object.length > 100, "Bytecode should be generated");

    const functionNames = (content.abi as Array<{ name?: string }>)
      .map((item) => item.name)
      .filter(Boolean);

    assert.ok(functionNames.includes("createAndFundJob"), "Should export createAndFundJob");
    assert.ok(functionNames.includes("completeJob"), "Should export completeJob");
    assert.ok(functionNames.includes("refundExpiredJob"), "Should export refundExpiredJob");
    assert.ok(functionNames.includes("getJob"), "Should export getJob");
  });
});
