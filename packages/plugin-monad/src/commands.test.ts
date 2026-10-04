import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicClient } from "viem";

import type { CommandIO, PluginCommandContext, WalletExecutorRequest, WalletExecutorResult } from "./sdk.js";
import { MonadPayCommand } from "./commands/pay.js";
import { MonadIdentityRegisterCommand } from "./commands/identity/register.js";
import { MonadIdentityGetCommand } from "./commands/identity/get.js";
import { MonadReputationCheckCommand } from "./commands/reputation/check.js";
import { MonadReputationGiveCommand } from "./commands/reputation/give.js";
import { MonadJobsCreateCommand } from "./commands/jobs/create.js";

function createMockIO(inputs: unknown): CommandIO & { logs: string[] } {
  const logs: string[] = [];
  return {
    logs,
    resolveInputs: async <T>() => inputs as unknown as T,
    log: (msg: string) => logs.push(msg),
    error: (msg: string) => logs.push(`[ERROR] ${msg}`),
    warn: (msg: string) => logs.push(`[WARN] ${msg}`),
  };
}

function createMockContext(overrides?: {
  executorResult?: WalletExecutorResult;
  contractReads?: Record<string, unknown>;
}): PluginCommandContext {
  const executorResult: WalletExecutorResult = overrides?.executorResult ?? {
    status: "success",
    hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  };

  const mockPublicClient = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "ownerOf") return "0x9999999999999999999999999999999999999999";
      if (functionName === "getAgentWallet") return "0x8888888888888888888888888888888888888888";
      if (functionName === "tokenURI") {
        const cardJson = JSON.stringify({
          name: "MonadArbitrageAgent",
          description: "High speed trader",
          endpoints: ["https://trader.monad.xyz"],
          walletAddress: "0x8888888888888888888888888888888888888888",
          supportedProtocols: ["mcp"],
          active: true,
        });
        return `data:application/json;utf8,${encodeURIComponent(cardJson)}`;
      }
      if (functionName === "getSummary") {
        return [BigInt(10), BigInt(950), 0]; // 10 feedback, score 950 sum, 0 decimals -> 95 avg
      }
      return null;
    },
  } as unknown as PublicClient;

  return {
    publicClient: () => mockPublicClient,
    walletExecutor: () => async (_req: WalletExecutorRequest) => executorResult,
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  };
}

describe("MetaMask Agent Wallet Plugin for Monad", () => {
  it("executes monad:pay successfully with walletExecutor", async () => {
    const cmd = new MonadPayCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({
      to: "0x1111111111111111111111111111111111111111",
      amount: "2.5",
      token: "MON",
      memo: "Data fee",
    });

    const result = await cmd.execute(io);
    assert.equal(result.amount, "2.5");
    assert.equal(result.to, "0x1111111111111111111111111111111111111111");
    assert.ok(result.transactionHash.startsWith("0x"));
  });

  it("registers agent identity on Monad ERC-8004", async () => {
    const cmd = new MonadIdentityRegisterCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({
      name: "MonadAlphaAgent",
      description: "Subcontractor for Monad DeFi",
      endpoints: ["https://alpha.example.com"],
      walletAddress: "0x2222222222222222222222222222222222222222",
      supportedProtocols: ["mcp", "x402"],
      active: true,
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentCard.name, "MonadAlphaAgent");
    assert.ok(result.transactionHash.startsWith("0x"));
  });

  it("fetches agent identity and parses agent card metadata", async () => {
    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({ agentId: "101" });
    const result = await cmd.execute(io);

    assert.equal(result.agentId, "101");
    assert.equal(result.card?.name, "MonadArbitrageAgent");
    assert.equal(result.walletAddress, "0x8888888888888888888888888888888888888888");
  });

  it("checks reputation on Monad and computes trustTier", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({ agentId: "101", tag1: "speed", tag2: "defi" });
    const result = await cmd.execute(io);

    assert.equal(result.agentId, "101");
    assert.equal(result.feedbackCount, 10);
    assert.equal(result.averageScore, 95);
    assert.equal(result.trustTier, "HIGH");
  });

  it("submits peer feedback to Monad Reputation Registry", async () => {
    const cmd = new MonadReputationGiveCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({
      agentId: "101",
      value: 100,
      decimals: 0,
      tag1: "accuracy",
      tag2: "execution",
      endpoint: "https://agent.example.com",
      feedbackURI: "https://agent.example.com/proof",
    });

    const result = await cmd.execute(io);
    assert.equal(result.feedback.agentId, "101");
    assert.equal(result.feedback.value, 100);
  });

  it("creates and funds an A2A task escrow on Monad", async () => {
    const cmd = new MonadJobsCreateCommand();
    const ctx = createMockContext();
    cmd.setContext(ctx);

    const io = createMockIO({
      workerAddress: "0x3333333333333333333333333333333333333333",
      bountyMon: "0.5",
      taskDescription: "Compute optimal routing across Monad DEX pools",
      deadlineHours: 12,
    });

    const result = await cmd.execute(io);
    assert.equal(result.bountyMon, "0.5");
    assert.ok(result.jobId.startsWith("job_"));
  });
});
