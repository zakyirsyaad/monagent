/**
 * Demo Script: MetaMask Agent Wallet Plugin for Monad (@monagent/plugin-monad)
 *
 * Demonstrates the 5 essential A2A flows for the Metropolis Hackathon:
 * 1. Register Agent Identity on Monad (ERC-8004)
 * 2. Lookup Agent Identity & Card
 * 3. Inspect Peer Reputation & Trust Tier
 * 4. Execute Native MON Payment with sub-second finality
 * 5. Create & Fund A2A Subcontracted Task Escrow
 * 6. Submit Immutable On-Chain Feedback (ERC-8004)
 *
 * Run: npx tsx scripts/demo-monad-plugin.ts
 */

import {
  MonadIdentityRegisterCommand,
  MonadIdentityGetCommand,
  MonadReputationCheckCommand,
  MonadReputationGiveCommand,
  MonadPayCommand,
  MonadJobsCreateCommand,
  type CommandIO,
  type PluginCommandContext,
} from "../packages/plugin-monad/src/index.js";
import { MONAD_NETWORK } from "../packages/shared/src/monad.ts";

function createConsoleIO(inputs: unknown): CommandIO {
  return {
    resolveInputs: async <T>() => inputs as unknown as T,
    log: (msg: string) => console.log(`  [INFO] ${msg}`),
    error: (msg: string) => console.error(`  [ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`  [WARN] ${msg}`),
  };
}

function createDemoContext(): PluginCommandContext {
  const mockPublicClient = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "ownerOf") return "0x9876543210987654321098765432109876543210";
      if (functionName === "getAgentWallet") return "0x1234567890123456789012345678901234567890";
      if (functionName === "tokenURI") {
        const card = {
          name: "MonadAlphaWorker",
          description: "High-throughput specialized Monad analytics agent",
          endpoints: ["https://alpha-agent.monad.xyz/api"],
          walletAddress: "0x1234567890123456789012345678901234567890",
          supportedProtocols: ["mcp", "x402"],
          active: true,
        };
        return `data:application/json;utf8,${encodeURIComponent(JSON.stringify(card))}`;
      }
      if (functionName === "getSummary") {
        return [BigInt(24), BigInt(2280), 0]; // 24 feedback, average score 95
      }
      return null;
    },
  };

  return {
    publicClient: () => mockPublicClient as any,
    walletExecutor: (_io, commandId) => async (req) => {
      console.log(`  [MetaMask Policy Engine] Evaluated & Approved request for ${commandId}`);
      const mockHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}` as `0x${string}`;
      return {
        status: "success",
        hash: mockHash,
      };
    },
    logger: {
      info: (msg) => console.log(`[Plugin Log] ${msg}`),
      error: (msg) => console.error(`[Plugin Error] ${msg}`),
      warn: (msg) => console.warn(`[Plugin Warn] ${msg}`),
    },
  };
}

async function runDemo() {
  console.log("================================================================================");
  console.log("🚀 METAMASK AGENT WALLET PLUGIN ON MONAD - A2A COMMERCE & TRUST DEMO");
  console.log(`🔗 Target Network: ${MONAD_NETWORK.name} (Chain ID: ${MONAD_NETWORK.chainId})`);
  console.log(`⚡ RPC: ${MONAD_NETWORK.rpcUrl}`);
  console.log("================================================================================\n");

  const ctx = createDemoContext();

  // 1. Register Agent Identity on Monad ERC-8004
  console.log("1️⃣ Step 1: Registering Agent Identity on Monad ERC-8004 Registry...");
  const registerCmd = new MonadIdentityRegisterCommand();
  registerCmd.setContext(ctx);
  const regResult = await registerCmd.execute(
    createConsoleIO({
      name: "MonadAlphaWorker",
      description: "High-throughput specialized Monad analytics agent",
      endpoints: ["https://alpha-agent.monad.xyz/api"],
      walletAddress: "0x1234567890123456789012345678901234567890",
      supportedProtocols: ["mcp", "x402"],
      active: true,
    })
  );
  console.log(`   ✅ Registered Agent: ${regResult.agentCard.name}`);
  console.log(`   📜 Registry: ${regResult.registryAddress}`);
  console.log(`   🔗 TxHash: ${regResult.transactionHash}\n`);

  // 2. Query Agent Identity
  console.log("2️⃣ Step 2: Querying Agent Card on Monad...");
  const getCmd = new MonadIdentityGetCommand();
  getCmd.setContext(ctx);
  const getResult = await getCmd.execute(createConsoleIO({ agentId: "42" }));
  console.log(`   ✅ Fetched AgentId: ${getResult.agentId}`);
  console.log(`   👤 Wallet: ${getResult.walletAddress}`);
  console.log(`   🏷️ Description: ${getResult.card?.description}\n`);

  // 3. Inspect Peer Reputation
  console.log("3️⃣ Step 3: Checking Counterparty Reputation Score on Monad...");
  const repCheckCmd = new MonadReputationCheckCommand();
  repCheckCmd.setContext(ctx);
  const repResult = await repCheckCmd.execute(
    createConsoleIO({ agentId: "42", tag1: "speed", tag2: "accuracy" })
  );
  console.log(`   📊 Reviews: ${repResult.feedbackCount}`);
  console.log(`   ⭐ Average Score: ${repResult.averageScore} / 100`);
  console.log(`   🛡️ Trust Tier: ${repResult.trustTier} (Approved for automated interaction)\n`);

  // 4. Send Direct MON Payment
  console.log("4️⃣ Step 4: Executing Direct Micro-Payment on Monad...");
  const payCmd = new MonadPayCommand();
  payCmd.setContext(ctx);
  const payResult = await payCmd.execute(
    createConsoleIO({
      to: "0x1234567890123456789012345678901234567890",
      amount: "0.25",
      token: "MON",
      memo: "Fast inference fee",
    })
  );
  console.log(`   💸 Sent ${payResult.amount} ${payResult.token} to ${payResult.to}`);
  console.log(`   🔗 TxHash: ${payResult.transactionHash}\n`);

  // 5. Create A2A Subcontracted Task Escrow
  console.log("5️⃣ Step 5: Subcontracting Task & Funding Escrow on Monad...");
  const jobCmd = new MonadJobsCreateCommand();
  jobCmd.setContext(ctx);
  const jobResult = await jobCmd.execute(
    createConsoleIO({
      workerAddress: "0x1234567890123456789012345678901234567890",
      bountyMon: "1.0",
      taskDescription: "Run Monte-Carlo risk simulation on Monad liquidity pools",
      deadlineHours: 6,
    })
  );
  console.log(`   📦 Created Job: ${jobResult.jobId}`);
  console.log(`   💰 Escrow Bounty: ${jobResult.bountyMon} MON`);
  console.log(`   🔗 Escrow TxHash: ${jobResult.escrowTransactionHash}\n`);

  // 6. Give Reputation Feedback on Monad
  console.log("6️⃣ Step 6: Submitting Immutable On-Chain Feedback (ERC-8004)...");
  const repGiveCmd = new MonadReputationGiveCommand();
  repGiveCmd.setContext(ctx);
  const giveResult = await repGiveCmd.execute(
    createConsoleIO({
      agentId: "42",
      value: 98,
      decimals: 0,
      tag1: "speed",
      tag2: "accuracy",
      endpoint: "https://alpha-agent.monad.xyz/api",
      feedbackURI: "https://reports.monad.xyz/simulation-summary-42.json",
    })
  );
  console.log(`   🌟 Rated Agent 42: Score ${giveResult.feedback.value}/100`);
  console.log(`   🔗 Feedback TxHash: ${giveResult.transactionHash}\n`);

  console.log("================================================================================");
  console.log("🎉 ALL MONAD AGENT WALLET FLOWS COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
