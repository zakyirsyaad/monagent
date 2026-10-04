import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createPublicClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  type Abi,
  type Hex,
} from "viem";
import { MONAD_NETWORK } from "../../packages/shared/src/monad.js";

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

  const registryArtifact = JSON.parse(
    readFileSync(join(rootDir, "contracts/out/MonadAgentRegistry.sol/MonadAgentRegistry.json"), "utf8")
  ) as ForgeArtifact;

  const escrowArtifact = JSON.parse(
    readFileSync(join(rootDir, "contracts/out/MonadA2AEscrow.sol/MonadA2AEscrow.json"), "utf8")
  ) as ForgeArtifact;

  it("simulates deployment gas estimation on Monad Testnet for MonadAgentRegistry", async () => {
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

  it("simulates deployment gas estimation on Monad Testnet for MonadA2AEscrow", async () => {
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

  it("validates calldata encoding for registerAgent", () => {
    const data = encodeFunctionData({
      abi: registryArtifact.abi,
      functionName: "registerAgent",
      args: ["AgentAlpha", "High frequency trader", "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa", "https://api.agent.xyz"],
    });

    assert.ok(data.startsWith("0x"));
  });
});
