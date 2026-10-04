/**
 * Live Monad Testnet On-Chain Transactions
 *
 * Interacts directly with the verified deployed contracts:
 * 1. MonadAgentRegistry (0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51)
 *    - registerAgent()
 *    - giveFeedback()
 *    - read on-chain summary via getSummary()
 * 2. MonadA2AEscrow (0x31665c49a8e0565f3e496080a08f089d29bbcaae)
 *    - createAndFundJob()
 *    - completeJob()
 *
 * Run: npx tsx scripts/live-contracts-interaction.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MONAD_NETWORK,
  MONAD_DEPLOYED_AGENT_REGISTRY,
  MONAD_DEPLOYED_A2A_ESCROW,
} from "../packages/plugin-monad/src/monad.js";

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

const registryAbi = parseAbi([
  "function registerAgent(string name, string description, address walletAddress, string endpoint) returns (uint256 agentId)",
  "function giveFeedback(uint256 agentId, int128 value, uint8 decimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getAgent(uint256 agentId) view returns ((string name, string description, address walletAddress, string endpoint, uint256 createdAt, bool active))",
]);

const escrowAbi = parseAbi([
  "function createAndFundJob(address worker, string taskDescription, uint256 durationHours) payable returns (uint256 jobId)",
  "function completeJob(uint256 jobId, string resultURI)",
  "function getJob(uint256 jobId) view returns ((address client, address worker, uint256 bounty, uint256 deadline, uint8 status, string taskDescription, string resultURI))",
]);

async function main() {
  console.log("================================================================================");
  console.log("⚡ EXECUTING LIVE ON-CHAIN TRANSACTIONS ON MONAD TESTNET");
  console.log(`🔗 Target RPC: ${MONAD_NETWORK.rpcUrl}`);
  console.log("================================================================================\n");

  const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("MONAD_TESTNET_PRIVATE_KEY is required");
  }

  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(formattedKey);
  console.log(`👤 Active Operator Wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: monadChain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadChain,
    transport: http(),
  });

  // 1. Live Transaction: Register Agent on MonadAgentRegistry
  console.log("1️⃣ Executing live registerAgent() on MonadAgentRegistry...");
  console.log(`   Contract: ${MONAD_DEPLOYED_AGENT_REGISTRY}`);

  const regTx = await walletClient.writeContract({
    address: MONAD_DEPLOYED_AGENT_REGISTRY,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [
      "MonAgentAlphaWorker",
      "Specialized high-speed Monad DEX arbitrage and analytics agent",
      account.address,
      "https://api.monagent.xyz/worker",
    ],
  });

  console.log(`   🚀 Tx Submitted: ${regTx}`);
  console.log("   ⏳ Waiting for block confirmation...");
  const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regTx });
  console.log(`   ✅ Confirmed in block ${regReceipt.blockNumber}! Status: ${regReceipt.status}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/tx/${regTx}\n`);

  // Query agentId = 1
  const agentDetails = await publicClient.readContract({
    address: MONAD_DEPLOYED_AGENT_REGISTRY,
    abi: registryAbi,
    functionName: "getAgent",
    args: [1n],
  });
  console.log(`   📋 On-Chain Registered Agent #1:`);
  console.log(`      Name: ${agentDetails.name}`);
  console.log(`      Wallet: ${agentDetails.walletAddress}`);
  console.log(`      Active: ${agentDetails.active}\n`);

  // 2. Live Transaction: Submit On-Chain Reputation Feedback
  console.log("2️⃣ Executing live giveFeedback() on MonadAgentRegistry...");
  const feedbackHash = keccak256(toHex("https://monagent.xyz/proofs/eval-101.json"));

  const feedbackTx = await walletClient.writeContract({
    address: MONAD_DEPLOYED_AGENT_REGISTRY,
    abi: registryAbi,
    functionName: "giveFeedback",
    args: [
      1n, // agentId 1
      98n, // rating +98/100
      0, // decimals
      "speed",
      "accuracy",
      "https://api.monagent.xyz/worker",
      "https://monagent.xyz/proofs/eval-101.json",
      feedbackHash,
    ],
  });

  console.log(`   🚀 Tx Submitted: ${feedbackTx}`);
  console.log("   ⏳ Waiting for block confirmation...");
  const feedbackReceipt = await publicClient.waitForTransactionReceipt({ hash: feedbackTx });
  console.log(`   ✅ Confirmed in block ${feedbackReceipt.blockNumber}! Status: ${feedbackReceipt.status}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/tx/${feedbackTx}\n`);

  // Read summary
  const summary = await publicClient.readContract({
    address: MONAD_DEPLOYED_AGENT_REGISTRY,
    abi: registryAbi,
    functionName: "getSummary",
    args: [1n, [], "", ""],
  });
  console.log(`   ⭐ On-Chain Reputation Summary for Agent #1:`);
  console.log(`      Total Reviews: ${summary[0].toString()}`);
  console.log(`      Cumulative Score: ${summary[1].toString()}/100\n`);

  // 3. Live Transaction: Create & Fund Escrow Job on MonadA2AEscrow
  console.log("3️⃣ Executing live createAndFundJob() on MonadA2AEscrow...");
  console.log(`   Contract: ${MONAD_DEPLOYED_A2A_ESCROW}`);

  const escrowAmount = parseEther("0.005"); // 0.005 MON
  const escrowTx = await walletClient.writeContract({
    address: MONAD_DEPLOYED_A2A_ESCROW,
    abi: escrowAbi,
    functionName: "createAndFundJob",
    args: [
      account.address, // Worker (self for demo settlement verification)
      "Execute high-frequency market depth analysis on Monad AMM",
      24n, // 24 hours
    ],
    value: escrowAmount,
  });

  console.log(`   🚀 Tx Submitted (Bounty: 0.005 MON): ${escrowTx}`);
  console.log("   ⏳ Waiting for block confirmation...");
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowTx });
  console.log(`   ✅ Confirmed in block ${escrowReceipt.blockNumber}! Status: ${escrowReceipt.status}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/tx/${escrowTx}\n`);

  // 4. Live Transaction: Complete Job & Release Escrow Bounty
  console.log("4️⃣ Executing live completeJob() & releasing bounty on MonadA2AEscrow...");

  const completeTx = await walletClient.writeContract({
    address: MONAD_DEPLOYED_A2A_ESCROW,
    abi: escrowAbi,
    functionName: "completeJob",
    args: [
      1n, // jobId 1
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    ],
  });

  console.log(`   🚀 Tx Submitted: ${completeTx}`);
  console.log("   ⏳ Waiting for block confirmation...");
  const completeReceipt = await publicClient.waitForTransactionReceipt({ hash: completeTx });
  console.log(`   ✅ Confirmed in block ${completeReceipt.blockNumber}! Status: ${completeReceipt.status}`);
  console.log(`   🔍 Explorer: ${MONAD_NETWORK.explorerUrl}/tx/${completeTx}\n`);

  const jobOnChain = await publicClient.readContract({
    address: MONAD_DEPLOYED_A2A_ESCROW,
    abi: escrowAbi,
    functionName: "getJob",
    args: [1n],
  });

  console.log(`   📦 Final On-Chain Escrow Status for Job #1:`);
  console.log(`      Client: ${jobOnChain.client}`);
  console.log(`      Worker: ${jobOnChain.worker}`);
  console.log(`      Status: ${jobOnChain.status === 2 ? "COMPLETED & SETTLED" : jobOnChain.status}`);
  console.log(`      Result URI: ${jobOnChain.resultURI}\n`);

  console.log("================================================================================");
  console.log("🎉 ALL 4 LIVE ON-CHAIN TRANSACTIONS COMPLETED ON MONAD TESTNET!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Live transaction failed:", err);
  process.exit(1);
});
