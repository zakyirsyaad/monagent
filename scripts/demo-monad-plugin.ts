/**
 * Demo Script: MetaMask Agent Wallet Plugin for Monad (@zakyirsyaad/monagent-plugin)
 *
 * Walks through the main flows against a MOCKED host context and prints placeholder
 * transaction hashes (matching README.md specification).
 *
 * Demonstrates:
 * 1. Register Agent Identity on Monad (ERC-8004)
 * 2. Lookup Agent Identity & Card
 * 3. Inspect Peer Reputation & Trust Tier
 * 4. Execute Native MON Payment (Simulated host execution)
 * 5. A2A Subcontracted Task Escrow (Status: Skipped - blocked on testnet writes)
 * 6. Submit Immutable On-Chain Feedback (ERC-8004)
 *
 * All operations run through simulated agent wallet context. No raw private keys,
 * secret handling, or wallet bypasses are used.
 *
 * Run: npm run demo:local
 */

import {
  createPublicClient,
  http,
  type PublicClient,
} from "viem";

import {
  MonadIdentityRegisterCommand,
  MonadIdentityGetCommand,
  MonadReputationCheckCommand,
  MonadReputationGiveCommand,
  MonadPayCommand,
  type CommandIO,
  type PluginCommandContext,
} from "../packages/plugin-monad/src/index.js";
import { MONAD_NETWORK } from "../packages/plugin-monad/src/monad.js";

function createConsoleIO(inputs: unknown): CommandIO {
  return {
    resolveInputs: async <T>() => inputs as unknown as T,
    emit: (msg: string) => {
      // Omit live explorer links for simulated mock hashes
      if (msg.startsWith("Explorer: ")) {
        return;
      }
      console.log(`  [OUTPUT] ${msg}`);
    },
    yield: () => {},
    notify: () => {},
    progress: () => {},
    log: (_level: any, msg: string) => console.log(`  [INFO] ${msg}`),
    error: (msg: string) => console.error(`  [ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`  [WARN] ${msg}`),
    flags: inputs as any,
    isInteractive: false,
  } as unknown as CommandIO;
}

const monadChain = {
  id: MONAD_NETWORK.chainId,
  name: MONAD_NETWORK.name,
  nativeCurrency: MONAD_NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: [MONAD_NETWORK.rpcUrl] },
    public: { http: [MONAD_NETWORK.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: MONAD_NETWORK.explorerUrl },
  },
} as const;

function createDemoContext(): PluginCommandContext {
  const livePublicClient = createPublicClient({
    chain: monadChain,
    transport: http(),
  });

  const mockPublicClient = {
    ...livePublicClient,
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "ownerOf") return "0x9876543210987654321098765432109876543210";
      if (functionName === "getAgentWallet") return "0x1234567890123456789012345678901234567890";
      if (functionName === "getAgent") {
        return {
          name: "MonadAlphaWorker",
          description: "High-throughput specialized Monad analytics agent",
          walletAddress: "0x1234567890123456789012345678901234567890",
          endpoint: "https://alpha-agent.monad.xyz/api",
          createdAt: BigInt(Date.now()),
          active: true,
        };
      }
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
    waitForTransactionReceipt: async () => ({
      status: "success",
      logs: [
        {
          address: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
          topics: [
            // Registered(uint256,string,address)
            "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a",
            "0x000000000000000000000000000000000000000000000000000000000000002a", // 42 in hex
            "0x0000000000000000000000001234567890123456789012345678901234567890",
          ],
          data: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000020646174613a6170706c69636174696f6e2f6a736f6e3b6261736536342c616263",
        },
      ],
    }),
  } as unknown as PublicClient;

  return {
    publicClient: () => mockPublicClient,
    walletExecutor: async (_io: CommandIO, commandId: string) => async () => {
      console.log(`  [MOCK host — simulated execution] Request for ${commandId}`);
      const mockHash = `0x${"1234567890abcdef".repeat(4)}` as `0x${string}`;
      return {
        status: "CONFIRMED",
        hash: mockHash,
      };
    },
    logger: {
      info: (msg: string) => console.log(`[Plugin Log] ${msg}`),
      error: (msg: string) => console.error(`[Plugin Error] ${msg}`),
      warn: (msg: string) => console.warn(`[Plugin Warn] ${msg}`),
    },
  } as unknown as PluginCommandContext;
}

async function runDemo() {
  console.log("================================================================================");
  console.log("🚀 METAMASK AGENT WALLET PLUGIN ON MONAD - A2A COMMERCE & TRUST DEMO");
  console.log(`🔗 Target Network: ${MONAD_NETWORK.name} (Chain ID: ${MONAD_NETWORK.chainId})`);
  console.log("ℹ️ Environment: Mocked Agent Wallet Host Context (Simulated Execution)");
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
  console.log(`   🔗 TxHash: [MOCK HASH] ${regResult.transactionHash}\n`);

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
  console.log(`   📊 Reviews: ${repResult.feedbackCount} [MOCK DATA]`);
  console.log(`   ⭐ Average Score: ${repResult.averageScore} / 100 [MOCK DATA]`);
  console.log(`   🛡️ Trust Tier: ${repResult.trustTier} [MOCK DATA]\n`);

  // 4. Send Direct MON Payment
  console.log("4️⃣ Step 4: Executing Direct Micro-Payment on Monad (Simulated)...");
  const payCmd = new MonadPayCommand();
  payCmd.setContext(ctx);
  const payResult = await payCmd.execute(
    createConsoleIO({
      to: "0x1234567890123456789012345678901234567890",
      amount: "0.001",
      token: "MON",
      memo: "Fast inference fee",
    })
  );
  console.log(`   💸 Sent ${payResult.amount} ${payResult.token} to ${payResult.to}`);
  console.log(`   🔗 TxHash: [MOCK HASH] ${payResult.transactionHash}`);
  console.log(`   ℹ️ (Simulated host execution: placeholder transaction hash, no real broadcast)\n`);

  // 5. A2A Subcontracted Task Escrow
  console.log("5️⃣ Step 5: A2A Subcontracted Task Escrow on Monad...");
  console.log("   ⚠️ [SKIPPED] Escrow writes are currently blocked (MetaMask testnet writes pending; escrow not deployed on mainnet).");
  console.log("   ℹ️ See skills/monad-agent/SKILL.md and README.md for details.\n");

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
  console.log(`   🌟 Rated Agent 42: Score 98/100`);
  console.log(`   🔗 Feedback TxHash: [MOCK HASH] ${giveResult.transactionHash}\n`);

  console.log("================================================================================");
  console.log("🎉 MONAD AGENT WALLET DEMO WALKTHROUGH COMPLETED!");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
