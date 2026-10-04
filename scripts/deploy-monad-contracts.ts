/**
 * Deploy Script for MonadAgentRegistry and MonadA2AEscrow on Monad Testnet
 *
 * Deploys the contracts to Monad Testnet using MONAD_TESTNET_PRIVATE_KEY
 * Run: npx tsx scripts/deploy-monad-contracts.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MONAD_NETWORK } from "../packages/plugin-monad/src/monad.js";

const monadChain = {
  id: MONAD_NETWORK.chainId,
  name: MONAD_NETWORK.name,
  nativeCurrency: MONAD_NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: [MONAD_NETWORK.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: MONAD_NETWORK.explorerUrl },
  },
} as const;

interface ForgeArtifact {
  abi: Abi;
  bytecode: { object: Hex };
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 DEPLOYING MONAD AGENT CONTRACTS TO MONAD TESTNET");
  console.log(`🔗 Target RPC: ${MONAD_NETWORK.rpcUrl}`);
  console.log("================================================================================\n");

  const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("MONAD_TESTNET_PRIVATE_KEY environment variable required");
  }

  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  console.log(`👤 Deployer Account: ${account.address}`);

  const publicClient = createPublicClient({
    chain: monadChain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadChain,
    transport: http(),
  });

  const rootDir = process.cwd();
  const registryArtifact = JSON.parse(
    readFileSync(join(rootDir, "contracts/out/MonadAgentRegistry.sol/MonadAgentRegistry.json"), "utf8")
  ) as ForgeArtifact;

  const escrowArtifact = JSON.parse(
    readFileSync(join(rootDir, "contracts/out/MonadA2AEscrow.sol/MonadA2AEscrow.json"), "utf8")
  ) as ForgeArtifact;

  // 1. Deploy MonadAgentRegistry
  console.log("1️⃣ Deploying MonadAgentRegistry (ERC-8004 Identity & Reputation)...");
  const regTxHash = await walletClient.deployContract({
    abi: registryArtifact.abi,
    bytecode: registryArtifact.bytecode.object,
  });
  console.log(`   Tx Submitted: ${regTxHash}`);
  console.log("   Waiting for confirmation (1-sec block time)...");
  const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regTxHash });
  const registryAddress = regReceipt.contractAddress;
  console.log(`   ✅ MonadAgentRegistry Deployed: ${registryAddress}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/address/${registryAddress}\n`);

  // 2. Deploy MonadA2AEscrow
  console.log("2️⃣ Deploying MonadA2AEscrow (A2A Subcontracting Escrow)...");
  const escrowTxHash = await walletClient.deployContract({
    abi: escrowArtifact.abi,
    bytecode: escrowArtifact.bytecode.object,
  });
  console.log(`   Tx Submitted: ${escrowTxHash}`);
  console.log("   Waiting for confirmation (1-sec block time)...");
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowTxHash });
  const escrowAddress = escrowReceipt.contractAddress;
  console.log(`   ✅ MonadA2AEscrow Deployed: ${escrowAddress}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/address/${escrowAddress}\n`);

  console.log("================================================================================");
  console.log("🎉 ALL CONTRACTS DEPLOYED ON MONAD TESTNET!");
  console.log(`📋 REGISTRY: ${registryAddress}`);
  console.log(`💼 ESCROW:   ${escrowAddress}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Deploy error:", err);
  process.exit(1);
});
