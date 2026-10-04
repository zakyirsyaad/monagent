import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicClient } from "viem";
import {
  resolveInputs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";

import type { CommandIO, PluginCommandContext, EvmExecutorResult } from "./sdk.js";
import { MonadPayCommand } from "./commands/monad/pay.js";
import { MonadIdentityRegisterCommand } from "./commands/monad/identity/register.js";
import { MonadIdentityGetCommand } from "./commands/monad/identity/get.js";
import { MonadReputationCheckCommand } from "./commands/monad/reputation/check.js";
import { MonadReputationGiveCommand } from "./commands/monad/reputation/give.js";
import { MonadJobsCreateCommand } from "./commands/monad/jobs/create.js";
import { MonadJobsCompleteCommand } from "./commands/monad/jobs/complete.js";
import { MonadJobsRefundCommand } from "./commands/monad/jobs/refund.js";
import { MonadX402PayCommand } from "./commands/monad/x402/pay.js";

function createMockIO(inputs: Record<string, unknown>): CommandIO & { logs: string[] } {
  const logs: string[] = [];
  return {
    resolveInputs: async <S extends Record<string, any>>(schema: S) => {
      return resolveInputs(schema as any, inputs, null);
    },
    emit: (msg: string) => logs.push(msg),
    yield: () => {},
    notify: () => {},
    progress: () => {},
    log: (_level: any, msg: string) => logs.push(msg),
    logs,
    signal: new AbortController().signal,
    flags: inputs,
    isInteractive: false,
  } as unknown as CommandIO & { logs: string[] };
}

function createMockContext(overrides?: {
  executorResult?: EvmExecutorResult;
  contractReads?: Record<string, unknown>;
}): PluginCommandContext {
  const executorResult: EvmExecutorResult = overrides?.executorResult ?? {
    status: "CONFIRMED",
    hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    signature:
      "0x111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111b",
  };

  const sampleTokenUri = `data:application/json;base64,${Buffer.from(
    JSON.stringify({
      name: "MonadArbitrageAgent",
      description: "High speed trader",
      services: [{ name: "A2A", endpoint: "https://trader.monad.xyz" }],
      active: true,
    })
  ).toString("base64")}`;

  const mockPublicClient = {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (overrides?.contractReads && functionName in overrides.contractReads) {
        return overrides.contractReads[functionName];
      }
      if (functionName === "ownerOf") return "0x9999999999999999999999999999999999999999";
      if (functionName === "getAgentWallet") return "0x8888888888888888888888888888888888888888";
      if (functionName === "tokenURI") return sampleTokenUri;
      if (functionName === "getClients") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      if (functionName === "getSummary") {
        return [10n, 950n, 0]; // 10 reviews, score 950, 0 decimals -> average 95
      }
      return null;
    },
    waitForTransactionReceipt: async () => ({
      status: "success",
      logs: [
        {
          address: "0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff",
          topics: [
            // JobCreated(uint256,address,address,uint256)
            "0x8f4ee83cefe0dfb2f73fe6057bfa5b233fc43358bbb5f5606f444cbd4c5c4f8c",
            "0x0000000000000000000000000000000000000000000000000000000000000007",
            "0x0000000000000000000000001111111111111111111111111111111111111111",
            "0x0000000000000000000000003333333333333333333333333333333333333333",
          ],
          data: "0x00000000000000000000000000000000000000000000000006f05b59d3b20000",
        },
        {
          address: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
          topics: [
            // Registered(uint256,string,address)
            "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a",
            "0x0000000000000000000000000000000000000000000000000000000000000007",
            "0x0000000000000000000000001111111111111111111111111111111111111111",
          ],
          data: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000020646174613a6170706c69636174696f6e2f6a736f6e3b6261736536342c616263",
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
  it("R2-1: every command schema is valid and transforms through host schemaToFlags & resolveInputs", async () => {
    const commandsWithInputs = [
      { name: "monad:pay", inputs: MonadPayCommand.inputs, mockFlags: { to: "0x1111111111111111111111111111111111111111", amount: "1.0" } },
      { name: "monad:identity:register", inputs: MonadIdentityRegisterCommand.inputs, mockFlags: { name: "Agent", description: "Desc", walletAddress: "0x1111111111111111111111111111111111111111" } },
      { name: "monad:identity:get", inputs: MonadIdentityGetCommand.inputs, mockFlags: { agentId: "1" } },
      { name: "monad:reputation:check", inputs: MonadReputationCheckCommand.inputs, mockFlags: { agentId: "1" } },
      { name: "monad:reputation:give", inputs: MonadReputationGiveCommand.inputs, mockFlags: { agentId: "1", value: "90" } },
      { name: "monad:jobs:create", inputs: MonadJobsCreateCommand.inputs, mockFlags: { workerAddress: "0x1111111111111111111111111111111111111111", bountyMon: "0.5", taskDescription: "Test task" } },
      { name: "monad:jobs:complete", inputs: MonadJobsCompleteCommand.inputs, mockFlags: { jobId: "1" } },
      { name: "monad:jobs:refund", inputs: MonadJobsRefundCommand.inputs, mockFlags: { jobId: "1" } },
      { name: "monad:x402:pay", inputs: MonadX402PayCommand.inputs, mockFlags: { url: "https://example.com" } },
    ];

    for (const cmd of commandsWithInputs) {
      // 1. Host schemaToFlags should not throw and should return flag definitions
      const flags = schemaToFlags(cmd.inputs);
      assert.ok(flags, `schemaToFlags failed for ${cmd.name}`);
      assert.ok(!("undefined" in flags), `schemaToFlags produced an 'undefined' flag for ${cmd.name}`);

      // 2. Host resolveInputs should resolve mockFlags without MISSING_FLAG
      const resolved = await resolveInputs(cmd.inputs, cmd.mockFlags, null);
      assert.ok(resolved, `resolveInputs failed for ${cmd.name}`);
      for (const [k, v] of Object.entries(cmd.mockFlags)) {
        assert.equal(resolved[k], v, `Field ${k} mismatch in ${cmd.name}`);
      }
    }
  });

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

  it("registers agent identity on Monad ERC-8004 via register(string agentURI)", async () => {
    const cmd = new MonadIdentityRegisterCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      name: "MonadSniperBot",
      description: "Sub-second DEX trading agent",
      walletAddress: "0x5555555555555555555555555555555555555555",
      endpoint: "https://sniper.monad.xyz",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentCard.name, "MonadSniperBot");
    assert.ok(result.transactionHash);
    assert.ok(result.registryAddress);
    assert.ok(result.agentId);
  });

  it("fetches agent identity and parses official ERC-8004 tokenURI metadata", async () => {
    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentId, "1");
    assert.equal(result.owner, "0x9999999999999999999999999999999999999999");
    assert.equal(result.walletAddress, "0x8888888888888888888888888888888888888888");
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
      value: "95",
      decimals: "0",
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
      deadlineHours: "12",
    });

    const result = await cmd.execute(io);
    assert.equal(result.bountyMon, "0.5");
    assert.equal(result.workerAddress, "0x3333333333333333333333333333333333333333");
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

  it("executes x402 payment negotiation using @x402/core and @x402/evm", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    // Mock global fetch for 402 negotiation
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async (url: any, init?: any) => {
      callCount++;
      if (callCount === 1) {
        // Return 402 with x402 payment required response
        return new Response(
          JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:10143",
                asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
                amount: "10000",
                payTo: "0x8888888888888888888888888888888888888888",
                maxTimeoutSeconds: 3600,
                extra: { name: "USDC", version: "2" },
              },
            ],
          }),
          {
            status: 402,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
      // Second call has PAYMENT-SIGNATURE
      assert.ok(init?.headers?.["PAYMENT-SIGNATURE"] || init?.headers?.["payment-signature"]);
      return new Response(JSON.stringify({ result: "premium weather prediction data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const io = createMockIO({
        url: "https://api.monad.xyz/paid/weather",
        maxSpend: "100000",
      });

      const res = await cmd.execute(io);
      assert.equal(res.statusCode, 200);
      assert.equal(res.paymentSettled, true);
      assert.equal(res.paymentDetails?.scheme, "exact");
      assert.equal(res.paymentDetails?.network, "eip155:10143");
      assert.equal(res.paymentDetails?.amount, "10000");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
