import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createPublicClient,
  decodeFunctionData,
  encodeDeployData,
  encodeFunctionData,
  http,
  type Abi,
  type Hex,
} from "viem";
import { MONAD_NETWORK } from "../../packages/plugin-monad/src/monad.js";

const monadChain = {
  id: MONAD_NETWORK.chainId,
  name: MONAD_NETWORK.name,
  nativeCurrency: MONAD_NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: [MONAD_NETWORK.rpcUrl] },
  },
} as const;

interface ForgeArtifact {
  abi: Abi;
  bytecode: { object: Hex };
}

describe("Monad Smart Contracts Live RPC Simulation & Gas Estimation", () => {
  const rootDir = process.cwd();
  const publicClient = createPublicClient({
    chain: monadChain,
    transport: http(),
  });

  const registryArtifactPath = join(
    rootDir,
    "contracts/out/MonadAgentRegistry.sol/MonadAgentRegistry.json"
  );
  const escrowArtifactPath = join(
    rootDir,
    "contracts/out/MonadA2AEscrow.sol/MonadA2AEscrow.json"
  );

  const registryArtifact = existsSync(registryArtifactPath)
    ? (JSON.parse(readFileSync(registryArtifactPath, "utf8")) as ForgeArtifact)
    : null;

  const escrowArtifact = existsSync(escrowArtifactPath)
    ? (JSON.parse(readFileSync(escrowArtifactPath, "utf8")) as ForgeArtifact)
    : null;

  it("simulates deployment gas estimation on Monad Testnet for MonadAgentRegistry", { skip: !process.env.RUN_LIVE_SMOKE }, async () => {
    assert.ok(registryArtifact, "registryArtifact required for live simulation");
    const deployData = encodeDeployData({
      abi: registryArtifact.abi,
      bytecode: registryArtifact.bytecode.object,
    });

    const gas = await publicClient.estimateGas({
      data: deployData,
      account: "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa",
    });

    assert.ok(gas > 100_000n, "Gas should be estimated");
    console.log(`      ⛽ Estimated Deploy Gas for MonadAgentRegistry: ${gas.toString()} units`);
  });

  it("simulates deployment gas estimation on Monad Testnet for MonadA2AEscrow", { skip: !process.env.RUN_LIVE_SMOKE }, async () => {
    assert.ok(escrowArtifact, "escrowArtifact required for live simulation");
    const deployData = encodeDeployData({
      abi: escrowArtifact.abi,
      bytecode: escrowArtifact.bytecode.object,
    });

    const gas = await publicClient.estimateGas({
      data: deployData,
      account: "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa",
    });

    assert.ok(gas > 100_000n, "Gas should be estimated");
    console.log(`      ⛽ Estimated Deploy Gas for MonadA2AEscrow: ${gas.toString()} units`);
  });

  it("validates calldata encoding for registerAgent", (t) => {
    if (!registryArtifact) {
      t.skip("contracts/out not found; run `(cd contracts && forge build)` to compile");
      return;
    }
    const data = encodeFunctionData({
      abi: registryArtifact.abi,
      functionName: "registerAgent",
      args: ["AgentAlpha", "High frequency trader", "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa", "https://api.agent.xyz"],
    });

    // 0x81a74915 is keccak256("registerAgent(string,string,address,string)").slice(0, 10)
    assert.equal(data.slice(0, 10), "0x81a74915");

    const decoded = decodeFunctionData({
      abi: registryArtifact.abi,
      data,
    });
    assert.equal(decoded.functionName, "registerAgent");
    assert.deepEqual(decoded.args, [
      "AgentAlpha",
      "High frequency trader",
      "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa",
      "https://api.agent.xyz",
    ]);
  });
});
