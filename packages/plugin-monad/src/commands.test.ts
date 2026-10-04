import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicClient } from "viem";

import type { CommandIO, PluginCommandContext, EvmExecutorResult } from "./sdk.js";
import { MonadPayCommand } from "./commands/monad/pay.js";
import { MonadIdentityRegisterCommand } from "./commands/monad/identity/register.js";
import { MonadIdentityGetCommand } from "./commands/monad/identity/get.js";
import { MonadReputationCheckCommand } from "./commands/monad/reputation/check.js";
import { MonadReputationGiveCommand } from "./commands/monad/reputation/give.js";
import { MonadJobsCreateCommand } from "./commands/monad/jobs/create.js";
import { MonadJobsCompleteCommand } from "./commands/monad/jobs/complete.js";
import { MonadJobsRefundCommand } from "./commands/monad/jobs/refund.js";

function createMockIO(inputs: unknown): CommandIO & { logs: string[] } {
  const logs: string[] = [];
  return {
    resolveInputs: async () => inputs,
    log: (msg: string) => logs.push(msg),
    error: (msg: string) => logs.push(`[ERR] ${msg}`),
    warn: (msg: string) => logs.push(`[WARN] ${msg}`),
    logs,
  } as unknown as CommandIO & { logs: string[] };
}

function createMockContext(overrides?: {
  executorResult?: EvmExecutorResult;
  contractReads?: Record<string, unknown>;
}): PluginCommandContext {
  const executorResult: EvmExecutorResult = overrides?.executorResult ?? {
    status: "CONFIRMED",
    hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  };

  const mockPublicClient = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (overrides?.contractReads && functionName in overrides.contractReads) {
        return overrides.contractReads[functionName];
      }
      if (functionName === "ownerOf") return "0x9999999999999999999999999999999999999999";
      if (functionName === "getAgentWallet") return "0x8888888888888888888888888888888888888888";
      if (functionName === "getAgent") {
        return {
          name: "MonadArbitrageAgent",
          description: "High speed trader",
          walletAddress: "0x8888888888888888888888888888888888888888",
          endpoint: "https://trader.monad.xyz",
          createdAt: BigInt(Date.now()),
          active: true,
        };
      }
      if (functionName === "getClients") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      if (functionName === "getSummary") {
        return [BigInt(10), BigInt(950), 0]; // 10 reviews, score 950, 0 decimals -> average 95
      }
      return null;
    },
    waitForTransactionReceipt: async () => ({
      status: "success",
      logs: [
        {
          topics: [
            "0x1234",
            "0x0000000000000000000000000000000000000000000000000000000000000005",
          ],
        },
      ],
    }),
  } as unknown as PublicClient;

  return {
    publicClient: () => mockPublicClient,
    walletExecutor: async () => async () => executorResult,
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  } as unknown as PluginCommandContext;
}

describe("MetaMask Agent Wallet Plugin for Monad", () => {
  it("executes monad:pay successfully with walletExecutor", async () => {
    const cmd = new MonadPayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "1.5",
      token: "MON",
      memo: "Autonomous service fee",
    });

    const result = await cmd.execute(io);
    assert.equal(result.to, "0x4444444444444444444444444444444444444444");
    assert.equal(result.amount, "1.5");
    assert.equal(result.token, "MON");
    assert.ok(result.transactionHash);
  });

  it("registers agent identity on Monad ERC-8004", async () => {
    const cmd = new MonadIdentityRegisterCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      name: "MonadSniperBot",
      description: "Sub-second DEX trading agent",
      walletAddress: "0x5555555555555555555555555555555555555555",
      endpoints: ["https://sniper.monad.xyz"],
      supportedProtocols: ["mcp", "x402"],
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentCard.name, "MonadSniperBot");
    assert.ok(result.transactionHash);
    assert.ok(result.registryAddress);
  });
  it("fetches agent identity and parses agent card metadata", async () => {
    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentId, "1");
    assert.equal(result.owner, "0x9999999999999999999999999999999999999999");
    assert.equal(result.card?.name, "MonadArbitrageAgent");
  });

  it("checks reputation on Monad and computes trustTier", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      tag1: "trading",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentId, "1");
    assert.equal(result.feedbackCount, 10);
    assert.equal(result.averageScore, 95);
    assert.equal(result.trustTier, "HIGH");
  });

  it("submits peer feedback to Monad Reputation Registry", async () => {
    const cmd = new MonadReputationGiveCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      value: 95,
      decimals: 0,
      tag1: "reliability",
      tag2: "speed",
      endpoint: "https://agent.xyz",
      feedbackURI: "ipfs://review-proof-hash",
    });

    const result = await cmd.execute(io);
    assert.equal(result.feedback.agentId, "1");
    assert.equal(result.feedback.value, 95);
    assert.ok(result.transactionHash);
  });

  it("creates and funds an A2A task escrow on Monad", async () => {
    const cmd = new MonadJobsCreateCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      workerAddress: "0x3333333333333333333333333333333333333333",
      bountyMon: "0.5",
      taskDescription: "Compute optimal routing across Monad DEX pools",
      deadlineHours: 12,
    });

    const result = await cmd.execute(io);
    assert.equal(result.bountyMon, "0.5");
    assert.equal(result.jobId, "5");
    assert.ok(result.escrowTransactionHash);
  });

  it("completes and releases an A2A task escrow on Monad", async () => {
    const cmd = new MonadJobsCompleteCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "5",
      resultURI: "ipfs://bafybeigydrtz5sfp7udm7hu76uh7y26nf3eufyqlqabf3ocltqy455fbzdi",
    });

    const result = await cmd.execute(io);
    assert.equal(result.jobId, "5");
    assert.ok(result.transactionHash);
  });

  it("refunds an expired A2A task escrow on Monad", async () => {
    const cmd = new MonadJobsRefundCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "5",
    });

    const result = await cmd.execute(io);
    assert.equal(result.jobId, "5");
    assert.ok(result.transactionHash);
  });
});
