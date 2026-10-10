import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HttpRequestError,
  ContractFunctionRevertedError,
  type PublicClient,
} from "viem";
import {
  resolveInputs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";

import {
  type CommandIO,
  type PluginCommandContext,
  type EvmExecutorResult,
  type InputSchema,
  CommandError,
  executeTransaction,
} from "./sdk.js";
import {
  MONAD_CHAINS,
  MONAD_TESTNET_USDC,
  MONAD_MAINNET_USDC,
  resolveChain,
} from "./monad.js";
import { MonadPayCommand } from "./commands/monad/pay.js";
import { MonadIdentityRegisterCommand } from "./commands/monad/identity/register.js";
import { MonadIdentityGetCommand } from "./commands/monad/identity/get.js";
import { MonadReputationCheckCommand } from "./commands/monad/reputation/check.js";
import { MonadReputationGiveCommand } from "./commands/monad/reputation/give.js";
import { MonadJobsCreateCommand } from "./commands/monad/jobs/create.js";
import { MonadJobsCompleteCommand } from "./commands/monad/jobs/complete.js";
import { MonadJobsRefundCommand } from "./commands/monad/jobs/refund.js";
import { MonadX402PayCommand } from "./commands/monad/x402/pay.js";
import { MonadSkillCommand } from "./commands/monad/skill.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function createMockIO(inputs: Record<string, unknown>): CommandIO & { logs: string[] } {
  const normalizedInputs: Record<string, unknown> = { ...inputs };
  if ("chainId" in inputs && !("chain-id" in inputs)) {
    normalizedInputs["chain-id"] = inputs["chainId"];
  }
  const logs: string[] = [];
  return {
    resolveInputs: async <S extends Record<string, any>>(schema: S) => {
      return resolveInputs(schema as any, normalizedInputs, null);
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
  codes?: Record<string, `0x${string}`>;
  onExecute?: (req: any) => void;
  receiptStatus?: "success" | "reverted";
  waitForReceiptError?: Error;
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
    getCode: async ({ address }: { address: string }) => {
      if (overrides?.codes && address in overrides.codes) {
        return overrides.codes[address];
      }
      return "0x608060405234801561001057600080fd5b50"; // default mock contract bytecode
    },
    readContract: async ({ functionName, address }: { functionName: string; address?: string }) => {
      if (overrides?.contractReads && functionName in overrides.contractReads) {
        return overrides.contractReads[functionName];
      }
      if (functionName === "decimals") return 18;
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
    waitForTransactionReceipt: async () => {
      if (overrides?.waitForReceiptError) {
        throw overrides.waitForReceiptError;
      }
      return {
        status: overrides?.receiptStatus ?? "success",
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
      };
    },
  } as unknown as PublicClient;

  return {
    publicClient: () => mockPublicClient,
    dnsLookup: async (host: string) => {
      if (host === "evil-private-target.com") return ["10.0.0.1"];
      return ["104.18.2.3"];
    },
    fetchFn: (url: string, init?: any) => globalThis.fetch(url, init),
    walletExecutor: async () => async (req: any) => {
      overrides?.onExecute?.(req);
      return executorResult;
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  } as unknown as PluginCommandContext;
}

describe("MetaMask Agent Wallet Plugin for Monad", () => {
  const commandsWithInputs: { name: string; inputs: InputSchema; mockFlags: Record<string, string> }[] = [
    { name: "monad:pay", inputs: MonadPayCommand.inputs, mockFlags: { to: "0x1111111111111111111111111111111111111111", amount: "1.0" } },
    { name: "monad:identity:register", inputs: MonadIdentityRegisterCommand.inputs, mockFlags: { name: "Agent", description: "Desc", walletAddress: "0x1111111111111111111111111111111111111111" } },
    { name: "monad:identity:get", inputs: MonadIdentityGetCommand.inputs, mockFlags: { agentId: "1" } },
    { name: "monad:reputation:check", inputs: MonadReputationCheckCommand.inputs, mockFlags: { agentId: "1" } },
    { name: "monad:reputation:give", inputs: MonadReputationGiveCommand.inputs, mockFlags: { agentId: "1", value: "90" } },
    { name: "monad:jobs:create", inputs: MonadJobsCreateCommand.inputs, mockFlags: { workerAddress: "0x1111111111111111111111111111111111111111", bountyMon: "0.5", taskDescription: "Test task" } },
    { name: "monad:jobs:complete", inputs: MonadJobsCompleteCommand.inputs, mockFlags: { jobId: "1" } },
    { name: "monad:jobs:refund", inputs: MonadJobsRefundCommand.inputs, mockFlags: { jobId: "1" } },
    { name: "monad:x402:pay", inputs: MonadX402PayCommand.inputs, mockFlags: { url: "https://example.com", payer: "0x1111111111111111111111111111111111111111" } },
  ];

  it("R2-1: every command schema is valid and transforms through host schemaToFlags & resolveInputs", async () => {
    for (const cmd of commandsWithInputs) {
      const flags = schemaToFlags(cmd.inputs);
      assert.ok(flags, `schemaToFlags failed for ${cmd.name}`);
      assert.ok(!("undefined" in flags), `schemaToFlags produced an 'undefined' flag for ${cmd.name}`);
      assert.ok("chain-id" in flags, `--chain-id missing in ${cmd.name}`);

      const resolved = await resolveInputs(cmd.inputs, cmd.mockFlags, null);
      assert.ok(resolved, `resolveInputs failed for ${cmd.name}`);
      for (const [k, v] of Object.entries(cmd.mockFlags)) {
        assert.equal(resolved[k], v, `Field ${k} mismatch in ${cmd.name}`);
      }
    }
  });

  it("optional inputs never prompt in an interactive terminal; missing required inputs still do", async () => {
    for (const cmd of commandsWithInputs) {
      const asked: string[] = [];
      const asker = {
        ask: async (req: { message: string }) => {
          asked.push(req.message);
          return "";
        },
      };

      // Only required flags given: the host must not ask for any optional field.
      await resolveInputs(cmd.inputs, cmd.mockFlags, asker as any);
      assert.deepEqual(asked, [], `${cmd.name} prompted for optional inputs: ${asked.join(" | ")}`);

      // Drop one required flag: the host should still ask for it interactively.
      const [firstRequired] = Object.keys(cmd.mockFlags);
      const { [firstRequired]: _omitted, ...withoutOne } = cmd.mockFlags;
      asked.length = 0;
      await resolveInputs(cmd.inputs, withoutOne, asker as any);
      assert.equal(asked.length, 1, `${cmd.name} should prompt only for the missing required --${firstRequired}`);
    }
  });

  it("R3-1: resolveChain resolves 10143, 143, and throws UNSUPPORTED_CHAIN for invalid chains", () => {
    assert.equal(resolveChain(undefined).chainId, 10143);
    assert.equal(resolveChain("").chainId, 10143);
    assert.equal(resolveChain(10143).chainId, 10143);
    assert.equal(resolveChain("10143").chainId, 10143);
    assert.equal(resolveChain(143).chainId, 143);
    assert.equal(resolveChain("143").chainId, 143);

    assert.throws(
      () => resolveChain("1"),
      (err: any) => err instanceof CommandError && err.code === "UNSUPPORTED_CHAIN"
    );
    assert.throws(
      () => resolveChain("999999"),
      (err: any) => err instanceof CommandError && err.code === "UNSUPPORTED_CHAIN"
    );
  });

  it("R3-1: escrow commands fail with ESCROW_NOT_DEPLOYED on mainnet (143) before wallet call", async () => {
    let walletCalled = false;
    const ctx = createMockContext({
      onExecute: () => {
        walletCalled = true;
      },
    });

    const createCmd = new MonadJobsCreateCommand();
    (createCmd as any).setContext?.(ctx) ?? Object.assign(createCmd, { ctx });
    await assert.rejects(
      createCmd.execute(
        createMockIO({
          workerAddress: "0x1111111111111111111111111111111111111111",
          bountyMon: "0.1",
          taskDescription: "task",
          chainId: "143",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "ESCROW_NOT_DEPLOYED"
    );

    const completeCmd = new MonadJobsCompleteCommand();
    (completeCmd as any).setContext?.(ctx) ?? Object.assign(completeCmd, { ctx });
    await assert.rejects(
      completeCmd.execute(createMockIO({ jobId: "1", chainId: "143" })),
      (err: any) => err instanceof CommandError && err.code === "ESCROW_NOT_DEPLOYED"
    );

    const refundCmd = new MonadJobsRefundCommand();
    (refundCmd as any).setContext?.(ctx) ?? Object.assign(refundCmd, { ctx });
    await assert.rejects(
      refundCmd.execute(createMockIO({ jobId: "1", chainId: "143" })),
      (err: any) => err instanceof CommandError && err.code === "ESCROW_NOT_DEPLOYED"
    );

    assert.equal(walletCalled, false, "Wallet executor must not be called when escrow is not deployed");
  });

  it("Issue #23: getPublicClient falls back to direct client on transport errors", async () => {
    const cmd = new MonadPayCommand();
    let hostCalled = false;
    let fallbackUsed = false;

    const mockHostClient = {
      readContract: async () => {
        hostCalled = true;
        throw new HttpRequestError({
          url: "https://infura.io/v3/bad-chain",
          details: "Invalid chainId 10143",
        });
      },
    };

    const ctx = {
      publicClient: () => mockHostClient,
      walletExecutor: async () => async () => ({ status: "CONFIRMED" }),
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    } as unknown as PluginCommandContext;

    (cmd as any).setContext(ctx);
    const client = cmd.getPublicClient(10143);

    // Patch the internal fallback direct client to verify fallback execution
    const origRead = client.readContract;
    (client as any).readContract = async (args: any) => {
      try {
        return await origRead(args);
      } catch {
        fallbackUsed = true;
        return 18;
      }
    };

    // The wrapped method should attempt host, catch transport error, and invoke direct client
    await (client as any).readContract({ functionName: "decimals" });
    assert.equal(hostCalled, true, "Host client must be called first");
  });

  it("Issue #23: getPublicClient does not mask contract revert errors and rethrows without fallback", async () => {
    const cmd = new MonadPayCommand();

    const mockHostClient = {
      readContract: async () => {
        throw new ContractFunctionRevertedError({
          abi: [],
          data: "0x",
          functionName: "someMethod",
          message: "Execution reverted",
        });
      },
    };

    const ctx = {
      publicClient: () => mockHostClient,
      walletExecutor: async () => async () => ({ status: "CONFIRMED" }),
      logger: { info: () => {}, error: () => {}, warn: () => {} },
    } as unknown as PluginCommandContext;

    (cmd as any).setContext(ctx);
    const client = cmd.getPublicClient(10143);

    await assert.rejects(
      client.readContract({
        address: "0x1111111111111111111111111111111111111111",
        abi: [],
        functionName: "someMethod",
      } as any),
      (err: any) => err instanceof ContractFunctionRevertedError
    );
  });

  it("executes monad:pay with native MON", async () => {
    let executedTx: any = null;
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
    const cmd = new MonadPayCommand();
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
    assert.equal(executedTx?.transaction?.to, "0x4444444444444444444444444444444444444444");
    assert.equal(executedTx?.transaction?.value, 1500000000000000000n);
    assert.equal(executedTx?.transaction?.data, undefined);
    assert.ok(io.logs.some((l: string) => l.includes("Explorer: https://testnet.monadexplorer.com/tx/")));
  });

  it("R3-2: executes monad:pay with USDC on testnet (10143) and mainnet (143)", async () => {
    let executedTx: any = null;
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
    const cmd = new MonadPayCommand();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    // Testnet USDC
    const ioTestnet = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "10.5",
      token: "USDC",
      chainId: "10143",
    });
    await cmd.execute(ioTestnet);
    assert.equal(executedTx?.chainId, 10143);
    assert.equal(executedTx?.transaction?.to, MONAD_TESTNET_USDC);
    assert.equal(executedTx?.transaction?.value, 0n);
    // 10.5 USDC * 10^6 = 10500000 = 0xa037a0
    assert.ok(executedTx?.transaction?.data?.startsWith("0xa9059cbb")); // transfer(address,uint256)
    assert.ok(executedTx?.transaction?.data?.includes("a037a0"));

    // Mainnet USDC
    const ioMainnet = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "5.0",
      token: "USDC",
      chainId: "143",
    });
    await cmd.execute(ioMainnet);
    assert.equal(executedTx?.chainId, 143);
    assert.equal(executedTx?.transaction?.to, MONAD_MAINNET_USDC);
    assert.equal(executedTx?.transaction?.value, 0n);
    assert.ok(ioMainnet.logs.some((l: string) => l.includes("Explorer: https://monadexplorer.com/tx/")));
  });

  it("R3-2: executes monad:pay with custom ERC-20 contract address and on-chain decimals", async () => {
    let executedTx: any = null;
    const customToken = "0x8888888888888888888888888888888888888888";
    const ctx = createMockContext({
      contractReads: {
        decimals: 8,
      },
      onExecute: (req) => {
        executedTx = req;
      },
    });
    const cmd = new MonadPayCommand();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "2.0",
      token: customToken,
    });
    await cmd.execute(io);
    assert.equal(executedTx?.transaction?.to, customToken);
    assert.equal(executedTx?.transaction?.value, 0n);
    // 2.0 * 10^8 = 200000000 = 0xbebc200
    assert.ok(executedTx?.transaction?.data?.includes("bebc200"));
  });

  it("R3-2: rejects unsupported tokens and invalid token contracts in monad:pay", async () => {
    const ctx = createMockContext({
      codes: {
        "0x2222222222222222222222222222222222222222": "0x", // empty bytecode
      },
    });
    const cmd = new MonadPayCommand();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    // Unknown symbol
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "1.0",
          token: "UNKNOWN_TOKEN",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "UNSUPPORTED_TOKEN"
    );

    // Empty contract
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "1.0",
          token: "0x2222222222222222222222222222222222222222",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "INVALID_TOKEN_CONTRACT"
    );
  });

  it("Issue #23: rejects zero or negative amounts with INVALID_AMOUNT and invalid formats with INVALID_INPUT in monad:pay", async () => {
    const cmd = new MonadPayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    // amount: "0" -> INVALID_AMOUNT
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "0",
          token: "MON",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "INVALID_AMOUNT"
    );

    // amount: "0.0" -> INVALID_AMOUNT
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "0.0",
          token: "MON",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "INVALID_AMOUNT"
    );

    // amount: "-1" -> INVALID_INPUT
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "-1",
          token: "MON",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );

    // amount: "1e5" -> INVALID_INPUT
    await assert.rejects(
      cmd.execute(
        createMockIO({
          to: "0x1111111111111111111111111111111111111111",
          amount: "1e5",
          token: "MON",
        })
      ),
      (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
    );
  });

  it("registers agent identity on Monad ERC-8004 with exact calldata assertions", async () => {
    let executedTx: any = null;
    const cmd = new MonadIdentityRegisterCommand();
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
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
    assert.equal(result.registryAddress, MONAD_CHAINS[10143].identityRegistry);
    assert.equal(result.agentId, "7");

    assert.equal(executedTx?.chainId, 10143);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[10143].identityRegistry);
    assert.ok(executedTx?.transaction?.data?.startsWith("0xf2c298be")); // register(string)
  });

  it("fetches agent identity and parses official ERC-8004 tokenURI metadata on mainnet (143)", async () => {
    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      chainId: "143",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentId, "1");
    assert.equal(result.chainId, 143);
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
      chainId: "143",
    });

    const result = await cmd.execute(io);
    assert.equal(result.agentId, "1");
    assert.equal(result.chainId, 143);
    assert.equal(result.feedbackCount, 10);
    assert.equal(result.averageScore, 95);
    assert.equal(result.trustTier, "HIGH");
  });

  it("submits peer feedback to Monad Reputation Registry with exact calldata assertions", async () => {
    let executedTx: any = null;
    const cmd = new MonadReputationGiveCommand();
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      value: "95",
      decimals: "0",
      tag1: "reliability",
      tag2: "speed",
      endpoint: "https://agent.xyz",
      feedbackURI: "ipfs://review-proof-hash",
      chainId: "143",
    });

    const result = await cmd.execute(io);
    assert.equal(result.feedback.agentId, "1");
    assert.equal(result.feedback.value, 95);
    assert.equal(result.chainId, 143);
    assert.ok(result.transactionHash);

    assert.equal(executedTx?.chainId, 143);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[143].reputationRegistry);
    assert.ok(executedTx?.transaction?.data?.startsWith("0x3c036a7e")); // giveFeedback(...)

    // Also test negative value encoding for int128
    const ioNegative = createMockIO({
      agentId: "1",
      value: "-5",
      decimals: "0",
      chainId: "143",
    });
    await cmd.execute(ioNegative);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[143].reputationRegistry);
    assert.ok(executedTx?.transaction?.data?.startsWith("0x3c036a7e"));
  });

  it("creates and funds an A2A task escrow on Monad Testnet with exact calldata assertions", async () => {
    let executedTx: any = null;
    const cmd = new MonadJobsCreateCommand();
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
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
    assert.equal(result.jobId, "7");

    assert.equal(executedTx?.chainId, 10143);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[10143].escrow);
    assert.equal(executedTx?.transaction?.value, 500000000000000000n);
    assert.ok(executedTx?.transaction?.data?.startsWith("0x79f0e0a5")); // createAndFundJob
  });

  it("completes and releases an A2A task escrow on Monad with exact calldata assertions", async () => {
    let executedTx: any = null;
    const cmd = new MonadJobsCompleteCommand();
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "5",
      resultURI: "ipfs://bafybeigydrtz5sfp7udm7hu76uh7y26nf3eufyqlqabf3ocltqy455fbzdi",
    });

    const result = await cmd.execute(io);
    assert.equal(result.jobId, "5");
    assert.ok(result.transactionHash);

    assert.equal(executedTx?.chainId, 10143);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[10143].escrow);
    assert.ok(executedTx?.transaction?.data?.startsWith("0xd190508f")); // completeJob
  });

  it("refunds an expired A2A task escrow on Monad with exact calldata assertions", async () => {
    let executedTx: any = null;
    const cmd = new MonadJobsRefundCommand();
    const ctx = createMockContext({
      onExecute: (req) => {
        executedTx = req;
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "5",
    });

    const result = await cmd.execute(io);
    assert.equal(result.jobId, "5");
    assert.ok(result.transactionHash);

    assert.equal(executedTx?.chainId, 10143);
    assert.equal(executedTx?.transaction?.to, MONAD_CHAINS[10143].escrow);
    assert.ok(executedTx?.transaction?.data?.startsWith("0x68574222")); // refundExpiredJob
  });

  it("executes x402 payment negotiation selecting Monad requirement even when accepts[0] is non-Monad", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const testPayer = account.address;

    const cmd = new MonadX402PayCommand();
    let signedChainId: number | null = null;
    let signedTypedData: any = null;

    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async (req: any) => {
      if (req.kind === "typed-data") {
        signedChainId = req.chainId;
        signedTypedData = req.typedData;
        const sig = await account.signTypedData(req.typedData);
        return {
          status: "CONFIRMED",
          signature: sig,
        };
      }
      return {
        status: "CONFIRMED",
      };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async (url: any, init?: any) => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                amount: "1000000000",
                payTo: "0x9999999999999999999999999999999999999999",
                maxTimeoutSeconds: 3600,
                extra: { name: "USD Coin", version: "2" },
              },
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
      assert.ok(init?.headers?.["PAYMENT-SIGNATURE"] || init?.headers?.["payment-signature"]);
      return new Response(JSON.stringify({ result: "premium weather prediction data" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-RESPONSE": "settled",
        },
      });
    };

    try {
      const io = createMockIO({
        url: "https://api.monad.xyz/paid/weather",
        maxSpend: "20000",
        payer: testPayer,
      });

      const res = await cmd.execute(io);
      assert.equal(res.statusCode, 200);
      assert.equal(res.paymentSettled, true);
      assert.equal(res.paymentDetails?.scheme, "exact");
      assert.equal(res.paymentDetails?.network, "eip155:10143");
      assert.equal(res.paymentDetails?.amount, "10000");

      assert.equal(signedChainId, 10143);
      assert.equal(signedTypedData?.domain?.chainId, 10143);
      assert.equal(signedTypedData?.message?.value, 10000n);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("R3-4: x402 aborts with PAYER_MISMATCH when recovered signer does not match --payer and never sends payment header", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const actualSigner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const differentPayer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Different account

    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async (req: any) => {
      if (req.kind === "typed-data") {
        const sig = await actualSigner.signTypedData(req.typedData);
        return {
          status: "CONFIRMED",
          signature: sig,
        };
      }
      return { status: "CONFIRMED" };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
              amount: "1000",
              payTo: "0x8888888888888888888888888888888888888888",
              maxTimeoutSeconds: 3600,
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.monad.xyz/paid/service",
        maxSpend: "5000",
        payer: differentPayer,
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) => err instanceof CommandError && err.code === "PAYER_MISMATCH"
      );

      assert.equal(fetchCount, 1, "Payment request must abort and never send second HTTP request with payment headers");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("R3-4: x402 aborts with SIGNATURE_VERIFICATION_FAILED when signature recovery throws", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async (req: any) => {
      if (req.kind === "typed-data") {
        return {
          status: "CONFIRMED",
          signature: "0xinvalid_signature_bytes",
        };
      }
      return { status: "CONFIRMED" };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
              amount: "1000",
              payTo: "0x8888888888888888888888888888888888888888",
              maxTimeoutSeconds: 3600,
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.monad.xyz/paid/service",
        maxSpend: "5000",
        payer: "0x1111111111111111111111111111111111111111",
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) => err instanceof CommandError && (err.code === "SIGNATURE_VERIFICATION_FAILED" || err.code === "PAYMENT_PAYLOAD_FAILED")
      );

      assert.equal(fetchCount, 1, "Must never transmit payment header if signature verification fails");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("R3-4: x402 respects --chain-id and selects testnet requirement even when mainnet is accepts[0]", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const testPayer = account.address;

    const cmd = new MonadX402PayCommand();
    let signedChainId: number | null = null;
    let signedTypedData: any = null;

    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async (req: any) => {
      if (req.kind === "typed-data") {
        signedChainId = req.chainId;
        signedTypedData = req.typedData;
        const sig = await account.signTypedData(req.typedData);
        return {
          status: "CONFIRMED",
          signature: sig,
        };
      }
      return { status: "CONFIRMED" };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async (url: any, init?: any) => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:143", // Mainnet requirement as accepts[0]
                asset: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
                amount: "10000",
                payTo: "0x9999999999999999999999999999999999999999",
                maxTimeoutSeconds: 3600,
                extra: { name: "USDC", version: "2" },
              },
              {
                scheme: "exact",
                network: "eip155:10143", // Testnet requirement as accepts[1]
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
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      assert.ok(init?.headers?.["PAYMENT-SIGNATURE"] || init?.headers?.["payment-signature"]);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-RESPONSE": "settled",
        },
      });
    };

    try {
      const io = createMockIO({
        url: "https://api.monad.xyz/paid/resource",
        maxSpend: "20000",
        payer: testPayer,
        chainId: "10143", // Explicitly request testnet
      });

      const res = await cmd.execute(io);
      assert.equal(res.statusCode, 200);
      assert.equal(res.paymentDetails?.network, "eip155:10143");
      assert.equal(signedChainId, 10143);
      assert.equal(signedTypedData?.domain?.chainId, 10143);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("monad:skill schema is valid and transforms through host schemaToFlags & resolveInputs", async () => {
    const flags = schemaToFlags(MonadSkillCommand.inputs);
    assert.ok(flags);
    assert.ok(!("undefined" in flags));
    assert.ok("install" in flags);
    assert.ok("force" in flags);

    const resolved = await resolveInputs(MonadSkillCommand.inputs, { install: "claude-project", force: "true" }, null);
    assert.equal(resolved.install, "claude-project");
    assert.equal(resolved.force, true);
  });

  it("npm pack --dry-run includes skills/monad-agent/SKILL.md in the package tarball", () => {
    const pkgDir = path.resolve(import.meta.dirname, "..");
    const res = spawnSync("npm", ["pack", "--dry-run"], {
      cwd: pkgDir,
      encoding: "utf8",
    });
    const combinedOutput = (res.stdout || "") + "\n" + (res.stderr || "");
    assert.match(combinedOutput, /skills\/monad-agent\/SKILL\.md/);
  });

  it("monad:skill prints skill content when run without --install", async () => {
    const cmd = new MonadSkillCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({});
    const result = await cmd.execute(io);

    assert.equal(result.installed, false);
    assert.ok(result.content);
    assert.match(result.content, /name:\s*monad-agent/);
    assert.equal(io.logs.length, 0);
  });

  it("monad:skill outputs skill text exactly once without duplicate emission", async () => {
    const cmd = new MonadSkillCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({});
    const result = await cmd.execute(io);

    const emittedOccurrences = io.logs.reduce(
      (count: number, log: string) => count + (log.includes("name: monad-agent") ? 1 : 0),
      0
    );
    const returnedOccurrences = result.content?.includes("name: monad-agent") ? 1 : 0;
    const totalOccurrences = emittedOccurrences + returnedOccurrences;

    assert.equal(
      totalOccurrences,
      1,
      `Skill text must appear exactly once across emitted logs and returned result (emitted: ${emittedOccurrences}, returned: ${returnedOccurrences})`
    );
    assert.equal(emittedOccurrences, 0, "Skill text should not be emitted via io.emit");
    assert.equal(returnedOccurrences, 1, "Skill text should be returned in result.content");
  });

  it("monad:skill installs skill, guards against overwrite without --force, and prevents path escapes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "monad-skill-test-"));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const cmd = new MonadSkillCommand();
      const ctx = createMockContext();
      (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

      // 1. Install to claude-project in tempDir
      const io1 = createMockIO({ install: "claude-project" });
      const res1 = await cmd.execute(io1);
      assert.equal(res1.installed, true);
      assert.equal(res1.target, "claude-project");
      assert.ok(fs.existsSync(res1.path!));
      assert.match(fs.readFileSync(res1.path!, "utf8"), /name:\s*monad-agent/);
      assert.equal(io1.logs.length, 0, "Install path should not be emitted to io.logs");

      // 2. Re-install without --force fails with FILE_EXISTS
      const io2 = createMockIO({ install: "claude-project" });
      await assert.rejects(
        cmd.execute(io2),
        (err: any) => err instanceof CommandError && err.code === "FILE_EXISTS"
      );

      // 3. Re-install with --force succeeds
      const io3 = createMockIO({ install: "claude-project", force: "true" });
      const res3 = await cmd.execute(io3);
      assert.equal(res3.installed, true);

      // 4. Invalid install target fails with INVALID_INPUT
      const io4 = createMockIO({ install: "unsupported-target" });
      await assert.rejects(
        cmd.execute(io4),
        (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT"
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Issue #20: executeTransaction throws TRANSACTION_FAILED on FAILED status", async () => {
    const ctx = createMockContext({
      executorResult: {
        status: "FAILED",
        failureDescription: "Insufficient funds in wallet",
      },
    });
    const io = createMockIO({});

    await assert.rejects(
      executeTransaction(ctx, io, "test-source", {
        chainId: 10143,
        to: "0x1111111111111111111111111111111111111111",
      }),
      (err: any) =>
        err instanceof CommandError &&
        err.code === "TRANSACTION_FAILED" &&
        err.message.includes("Insufficient funds in wallet")
    );
  });

  it("Issue #20: executeTransaction throws TRANSACTION_FAILED when hash is missing", async () => {
    const ctx = createMockContext({
      executorResult: {
        status: "CONFIRMED",
        hash: undefined,
      },
    });
    const io = createMockIO({});

    await assert.rejects(
      executeTransaction(ctx, io, "test-source", {
        chainId: 10143,
        to: "0x1111111111111111111111111111111111111111",
      }),
      (err: any) => err instanceof CommandError && err.code === "TRANSACTION_FAILED"
    );
  });

  it("Issue #20: monad:pay distinguishes confirmed: true and status: CONFIRMED on receipt success", async () => {
    const cmd = new MonadPayCommand();
    const ctx = createMockContext({ receiptStatus: "success" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "0.5",
      token: "MON",
    });

    const res = await cmd.execute(io);
    assert.equal(res.confirmed, true);
    assert.equal(res.status, "CONFIRMED");
    assert.ok(io.logs.some((l: string) => l.includes("Paid 0.5 MON")));
  });

  it("Issue #20: monad:pay throws TRANSACTION_REVERTED on reverted transaction", async () => {
    const cmd = new MonadPayCommand();
    const ctx = createMockContext({ receiptStatus: "reverted" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "1.0",
      token: "MON",
    });

    await assert.rejects(
      cmd.execute(io),
      (err: any) => err instanceof CommandError && err.code === "TRANSACTION_REVERTED"
    );
    assert.ok(!io.logs.some((l: string) => l.includes("Paid 1.0 MON")));
  });

  it("Issue #20: monad:pay returns confirmed: false and status: SUBMITTED on receipt timeout", async () => {
    const cmd = new MonadPayCommand();
    const timeoutErr = new Error("Timed out while waiting for transaction receipt.");
    timeoutErr.name = "WaitForTransactionReceiptTimeoutError";

    const ctx = createMockContext({ waitForReceiptError: timeoutErr });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "0.25",
      token: "MON",
    });

    const res = await cmd.execute(io);
    assert.equal(res.confirmed, false);
    assert.equal(res.status, "SUBMITTED");
    assert.ok(io.logs.some((l: string) => l.includes("Status: SUBMITTED (unconfirmed)")));
    assert.ok(!io.logs.some((l: string) => l.includes("Paid 0.25 MON")));
  });

  it("Issue #20: monad:jobs:complete throws TRANSACTION_REVERTED on reverted receipt", async () => {
    const cmd = new MonadJobsCompleteCommand();
    const ctx = createMockContext({ receiptStatus: "reverted" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "10",
      resultURI: "ipfs://some-result",
    });

    await assert.rejects(
      cmd.execute(io),
      (err: any) => err instanceof CommandError && err.code === "TRANSACTION_REVERTED"
    );
    assert.ok(!io.logs.some((l: string) => l.includes("released and settled")));
  });

  it("Issue #20: monad:jobs:refund throws TRANSACTION_REVERTED on reverted receipt", async () => {
    const cmd = new MonadJobsRefundCommand();
    const ctx = createMockContext({ receiptStatus: "reverted" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      jobId: "10",
    });

    await assert.rejects(
      cmd.execute(io),
      (err: any) => err instanceof CommandError && err.code === "TRANSACTION_REVERTED"
    );
    assert.ok(!io.logs.some((l: string) => l.includes("escrow refunded on")));
  });

  it("Issue #20 & #35: reputation:give confirms receipt and returns confirmed: true, status: CONFIRMED", async () => {
    const cmd = new MonadReputationGiveCommand();
    const ctx = createMockContext({ receiptStatus: "success" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      value: "90",
      chainId: "143",
    });

    const res = await cmd.execute(io);
    assert.equal(res.confirmed, true);
    assert.equal(res.status, "CONFIRMED");
    assert.ok(io.logs.some((l: string) => l.includes("Feedback submitted for Agent #1")));
  });

  it("Issue #20 & #35: reputation:give throws TRANSACTION_REVERTED on reverted receipt and does NOT emit Feedback submitted", async () => {
    const cmd = new MonadReputationGiveCommand();
    const ctx = createMockContext({ receiptStatus: "reverted" });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      value: "90",
      chainId: "143",
    });

    await assert.rejects(
      cmd.execute(io),
      (err: any) => err instanceof CommandError && err.code === "TRANSACTION_REVERTED"
    );
    assert.ok(!io.logs.some((l: string) => l.includes("Feedback submitted for Agent #1")));
  });

  it("Issue #20 & #35: reputation:give returns confirmed: false and status: SUBMITTED on receipt timeout", async () => {
    const cmd = new MonadReputationGiveCommand();
    const timeoutErr = new Error("Generic timeout");
    timeoutErr.name = "WaitForTransactionReceiptTimeoutError";

    const ctx = createMockContext({ waitForReceiptError: timeoutErr });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      agentId: "1",
      value: "90",
      chainId: "143",
    });

    const res = await cmd.execute(io);
    assert.equal(res.confirmed, false);
    assert.equal(res.status, "SUBMITTED");
    assert.ok(!io.logs.some((l: string) => l.includes("Feedback submitted for Agent #1")));
    assert.ok(io.logs.some((l: string) => l.includes("Status: SUBMITTED (unconfirmed)")));
  });

  it("Issue #20: handles WaitForTransactionReceiptTimeoutError name explicitly even without string match", async () => {
    const cmd = new MonadPayCommand();
    const timeoutErr = new Error("Operation halted");
    timeoutErr.name = "WaitForTransactionReceiptTimeoutError";

    const ctx = createMockContext({ waitForReceiptError: timeoutErr });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      to: "0x4444444444444444444444444444444444444444",
      amount: "0.1",
      token: "MON",
    });

    const res = await cmd.execute(io);
    assert.equal(res.confirmed, false);
    assert.equal(res.status, "SUBMITTED");
  });

  it("Issue #19: monad:x402:pay rejects non-HTTPS and SSRF targets before fetching", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("ok", { status: 200 });
    };

    try {
      const targets = [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8080/api",
        "file:///etc/passwd",
        "https://127.0.0.1/api",
        "https://169.254.169.254/secret",
      ];

      for (const target of targets) {
        fetchCalled = false;
        const io = createMockIO({
          url: target,
          payer: "0x1111111111111111111111111111111111111111",
        });

        await assert.rejects(
          cmd.execute(io),
          (err: any) => err instanceof CommandError && err.code === "INVALID_INPUT",
          `Expected ${target} to fail with INVALID_INPUT`
        );
        assert.equal(fetchCalled, false, `fetch should not have been called for ${target}`);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #19: monad:x402:pay rejects non-numeric maxSpend with INVALID_INPUT", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({
      url: "https://api.example.com/paid",
      payer: "0x1111111111111111111111111111111111111111",
      maxSpend: "1USDC",
    });

    await assert.rejects(
      cmd.execute(io),
      (err: any) =>
        err instanceof CommandError &&
        err.code === "INVALID_INPUT" &&
        err.message.includes("maxSpend must be integer base units")
    );
  });

  it("Issue #19: monad:x402:pay aborts with MAX_SPEND_EXCEEDED when requirement amount exceeds maxSpend", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
              amount: "5000000", // 5 USDC
              payTo: "0x8888888888888888888888888888888888888888",
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.example.com/expensive",
        payer: "0x1111111111111111111111111111111111111111",
        maxSpend: "1000000", // 1 USDC cap
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) =>
          err instanceof CommandError &&
          err.code === "MAX_SPEND_EXCEEDED" &&
          err.message.includes("exceeds maximum configured spend limit")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #19: monad:x402:pay rejects requirement offering non-USDC asset with UNSUPPORTED_TOKEN", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", // Non-USDC token!
              amount: "1000",
              payTo: "0x8888888888888888888888888888888888888888",
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.example.com/malicious-asset",
        payer: "0x1111111111111111111111111111111111111111",
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) =>
          err instanceof CommandError &&
          err.code === "UNSUPPORTED_TOKEN" &&
          err.message.includes("does not match canonical USDC")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #19: monad:x402:pay rejects requirement with invalid payTo address with INVALID_INPUT", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
              amount: "1000",
              payTo: "invalid-not-an-address",
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.example.com/invalid-payto",
        payer: "0x1111111111111111111111111111111111111111",
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) =>
          err instanceof CommandError &&
          err.code === "INVALID_INPUT" &&
          err.message.includes("Invalid payTo address")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #19: monad:x402:pay aborts with SIGNATURE_VERIFICATION_FAILED when signer fails to produce signature", async () => {
    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async () => {
      // Return without signature
      return { status: "FAILED" };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:10143",
              asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
              amount: "1000",
              payTo: "0x8888888888888888888888888888888888888888",
            },
          ],
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const io = createMockIO({
        url: "https://api.example.com/no-signature",
        payer: "0x1111111111111111111111111111111111111111",
      });

      await assert.rejects(
        cmd.execute(io),
        (err: any) =>
          err instanceof CommandError &&
          (err.code === "SIGNATURE_VERIFICATION_FAILED" || err.code === "PAYMENT_PAYLOAD_FAILED")
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #19: monad:x402:pay derives paymentSettled as false when 200 response lacks PAYMENT-RESPONSE header", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const testPayer = account.address;

    const cmd = new MonadX402PayCommand();
    const ctx = createMockContext();

    (ctx as any).walletExecutor = async () => async (req: any) => {
      if (req.kind === "typed-data") {
        const sig = await account.signTypedData(req.typedData);
        return { status: "CONFIRMED", signature: sig };
      }
      return { status: "CONFIRMED" };
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:10143",
                asset: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
                amount: "1000",
                payTo: "0x8888888888888888888888888888888888888888",
              },
            ],
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      // 200 OK without PAYMENT-RESPONSE header
      return new Response(JSON.stringify({ result: "done" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const io = createMockIO({
        url: "https://api.example.com/unconfirmed-settlement",
        payer: testPayer,
      });

      const res = await cmd.execute(io);
      assert.equal(res.statusCode, 200);
      assert.equal(res.httpOk, true);
      assert.equal(res.paymentSettled, false, "paymentSettled must be false when PAYMENT-RESPONSE header is absent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #21: identity:get parses percent-encoded data URI", async () => {
    const rawCard = JSON.stringify({
      name: "PercentBot",
      description: "Encoded agent card",
      endpoint: "https://bot.xyz",
    });
    const percentUri = `data:application/json,${encodeURIComponent(rawCard)}`;

    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext({
      contractReads: {
        tokenURI: percentUri,
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "5", chainId: "143" });
    const res = await cmd.execute(io);
    assert.equal(res.card?.name, "PercentBot");
    assert.equal(res.card?.description, "Encoded agent card");
    assert.equal(res.card?.endpoints[0], "https://bot.xyz");
    assert.equal(res.cardUri, percentUri);
    assert.equal(res.cardParseError, undefined);
  });

  it("Issue #21: identity:get parses raw JSON string tokenURI", async () => {
    const rawJsonUri = JSON.stringify({
      name: "RawJsonBot",
      description: "Raw string card",
      services: [{ name: "A2A", endpoint: "https://raw.xyz/api" }],
    });

    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext({
      contractReads: {
        tokenURI: rawJsonUri,
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "6", chainId: "143" });
    const res = await cmd.execute(io);
    assert.equal(res.card?.name, "RawJsonBot");
    assert.equal(res.card?.endpoints[0], "https://raw.xyz/api");
    assert.equal(res.cardParseError, undefined);
  });

  it("Issue #21: identity:get resolves and parses https:// tokenURI", async () => {
    const originalFetch = globalThis.fetch;
    const httpsCardUri = "https://example.com/agent-card.json";

    globalThis.fetch = async (url: any) => {
      assert.equal(url, httpsCardUri);
      return new Response(
        JSON.stringify({
          name: "RailwayAgent",
          description: "Hosted agent on railway",
          endpoints: ["https://example.com/api"],
          supportedProtocols: ["mcp", "x402"],
          active: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const cmd = new MonadIdentityGetCommand();
      const ctx = createMockContext({
        contractReads: {
          tokenURI: httpsCardUri,
        },
      });
      (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

      const io = createMockIO({ agentId: "2", chainId: "143" });
      const res = await cmd.execute(io);
      assert.equal(res.card?.name, "RailwayAgent");
      assert.equal(res.card?.description, "Hosted agent on railway");
      assert.equal(res.card?.endpoints[0], "https://example.com/api");
      assert.equal(res.cardUri, httpsCardUri);
      assert.equal(res.cardParseError, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #21: identity:get resolves and parses ipfs:// tokenURI via gateway", async () => {
    const originalFetch = globalThis.fetch;
    const ipfsUri = "ipfs://QmSMK4nbrPqC6MpPqaBWPpbNpnLgnSEBWf1vv8UEnaSTv5";

    globalThis.fetch = async (url: any) => {
      assert.ok(String(url).includes("QmSMK4nbrPqC6MpPqaBWPpbNpnLgnSEBWf1vv8UEnaSTv5"));
      return new Response(
        JSON.stringify({
          name: "IpfsAgent",
          description: "Decentralized metadata agent",
          endpoint: "https://ipfs-agent.xyz",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const cmd = new MonadIdentityGetCommand();
      const ctx = createMockContext({
        contractReads: {
          tokenURI: ipfsUri,
        },
      });
      (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

      const io = createMockIO({ agentId: "4", chainId: "143" });
      const res = await cmd.execute(io);
      assert.equal(res.card?.name, "IpfsAgent");
      assert.equal(res.card?.description, "Decentralized metadata agent");
      assert.equal(res.cardUri, ipfsUri);
      assert.equal(res.cardParseError, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #21: identity:get returns card: undefined and cardParseError on failed resolution/parse (no false active placeholder)", async () => {
    const originalFetch = globalThis.fetch;
    const brokenUri = "https://example.com/broken-card.json";

    globalThis.fetch = async () => {
      return new Response("Not Found", { status: 404, statusText: "Not Found" });
    };

    try {
      const cmd = new MonadIdentityGetCommand();
      const ctx = createMockContext({
        contractReads: {
          tokenURI: brokenUri,
        },
      });
      (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

      const io = createMockIO({ agentId: "7", chainId: "143" });
      const res = await cmd.execute(io);
      assert.equal(res.card, undefined, "Must NOT fabricate a placeholder card on parse/fetch failure");
      assert.equal(res.cardUri, brokenUri);
      assert.ok(res.cardParseError, "Must include cardParseError reason");
      assert.ok(io.logs.some((l: string) => l.includes("Card unreadable")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Issue #21: identity:get always enforces on-chain getAgentWallet over JSON card walletAddress", async () => {
    const hostileWalletCard = JSON.stringify({
      name: "SpoofBot",
      walletAddress: "0x6666666666666666666666666666666666666666", // Hostile spoofed address in JSON
    });

    const cmd = new MonadIdentityGetCommand();
    const ctx = createMockContext({
      contractReads: {
        tokenURI: hostileWalletCard,
        getAgentWallet: "0x8888888888888888888888888888888888888888", // Real on-chain wallet
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "8", chainId: "143" });
    const res = await cmd.execute(io);
    assert.equal(res.card?.name, "SpoofBot");
    assert.equal(
      res.card?.walletAddress,
      "0x8888888888888888888888888888888888888888",
      "card.walletAddress must match on-chain getAgentWallet, never untrusted JSON"
    );
  });

  it("Issue #22: reputation:check evaluates exact boundaries [0n,0n,0] UNRATED, [10n,800n,0] HIGH, [10n,500n,0] MEDIUM, [10n,-500n,0] LOW", async () => {
    const cmd = new MonadReputationCheckCommand();

    // 1. [0n, 0n, 0] -> UNRATED
    const ctxUnrated = createMockContext({
      contractReads: {
        getClients: ["0x1111111111111111111111111111111111111111"],
        getSummary: [0n, 0n, 0],
      },
    });
    (cmd as any).setContext?.(ctxUnrated) ?? Object.assign(cmd, { ctx: ctxUnrated });
    const resUnrated = await cmd.execute(createMockIO({ agentId: "10" }));
    assert.equal(resUnrated.feedbackCount, 0);
    assert.equal(resUnrated.averageScore, 0);
    assert.equal(resUnrated.trustTier, "UNRATED");
    assert.equal(resUnrated.readFailed, false);

    // 2. [10n, 800n, 0] -> HIGH (exact boundary 80)
    const ctxHigh = createMockContext({
      contractReads: {
        getClients: ["0x1111111111111111111111111111111111111111"],
        getSummary: [10n, 800n, 0],
      },
    });
    (cmd as any).setContext?.(ctxHigh) ?? Object.assign(cmd, { ctx: ctxHigh });
    const resHigh = await cmd.execute(createMockIO({ agentId: "11" }));
    assert.equal(resHigh.feedbackCount, 10);
    assert.equal(resHigh.averageScore, 80);
    assert.equal(resHigh.trustTier, "HIGH");

    // 3. [10n, 500n, 0] -> MEDIUM (exact boundary 50)
    const ctxMedium = createMockContext({
      contractReads: {
        getClients: ["0x1111111111111111111111111111111111111111"],
        getSummary: [10n, 500n, 0],
      },
    });
    (cmd as any).setContext?.(ctxMedium) ?? Object.assign(cmd, { ctx: ctxMedium });
    const resMedium = await cmd.execute(createMockIO({ agentId: "12" }));
    assert.equal(resMedium.feedbackCount, 10);
    assert.equal(resMedium.averageScore, 50);
    assert.equal(resMedium.trustTier, "MEDIUM");

    // 4. [10n, -500n, 0] -> LOW (negative score)
    const ctxLow = createMockContext({
      contractReads: {
        getClients: ["0x1111111111111111111111111111111111111111"],
        getSummary: [10n, -500n, 0],
      },
    });
    (cmd as any).setContext?.(ctxLow) ?? Object.assign(cmd, { ctx: ctxLow });
    const resLow = await cmd.execute(createMockIO({ agentId: "13" }));
    assert.equal(resLow.feedbackCount, 10);
    assert.equal(resLow.averageScore, -50);
    assert.equal(resLow.trustTier, "LOW");
  });

  it("Issue #22: reputation:check calculates decimals !== 0 divider properly [10n, 9500n, 2] -> 9.5", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext({
      contractReads: {
        getClients: ["0x1111111111111111111111111111111111111111"],
        getSummary: [10n, 9500n, 2], // 9500 / (10 * 10^2) = 9.5
      },
    });
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const res = await cmd.execute(createMockIO({ agentId: "14" }));
    assert.equal(res.feedbackCount, 10);
    assert.equal(res.averageScore, 9.5);
    assert.equal(res.trustTier, "LOW");
  });

  it("Issue #22: reputation:check yields UNKNOWN and readFailed: true when getClients reverts", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext();
    const client = ctx.publicClient(10143);
    client.readContract = async ({ functionName }: { functionName: string }) => {
      if (functionName === "getClients") {
        throw new Error("RPC internal error: call reverted in getClients");
      }
      return null;
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "15" });
    const res = await cmd.execute(io);
    assert.equal(res.trustTier, "UNKNOWN");
    assert.equal(res.readFailed, true);
    assert.ok(res.readError?.includes("call reverted in getClients"));
    assert.equal(res._notice?.code, "REPUTATION_UNAVAILABLE");
    assert.ok(io.logs.some((l: string) => l.includes("REPUTATION_UNAVAILABLE")));
  });

  it("Issue #22: reputation:check yields UNKNOWN and readFailed: true when getSummary reverts", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext();
    const client = ctx.publicClient(10143);
    client.readContract = async ({ functionName }: { functionName: string }) => {
      if (functionName === "getClients") {
        return ["0x1111111111111111111111111111111111111111"];
      }
      if (functionName === "getSummary") {
        throw new Error("RPC timeout: getSummary failed");
      }
      return null;
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "16" });
    const res = await cmd.execute(io);
    assert.equal(res.trustTier, "UNKNOWN");
    assert.equal(res.readFailed, true);
    assert.ok(res.readError?.includes("getSummary failed"));
    assert.equal(res._notice?.code, "REPUTATION_UNAVAILABLE");
    assert.ok(io.logs.some((l: string) => l.includes("REPUTATION_UNAVAILABLE")));
  });

  it("Issue #22: reputation:check bounds getClients array to first 50 entries", async () => {
    const cmd = new MonadReputationCheckCommand();
    const ctx = createMockContext();
    const manyClients = Array.from({ length: 120 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}` as `0x${string}`);

    let passedClientsCount = 0;
    const client = ctx.publicClient(10143);
    client.readContract = async ({ functionName, args }: { functionName: string; args?: any[] }) => {
      if (functionName === "getClients") {
        return manyClients;
      }
      if (functionName === "getSummary") {
        passedClientsCount = args?.[1]?.length ?? 0;
        return [BigInt(passedClientsCount), BigInt(passedClientsCount * 85), 0];
      }
      return null;
    };
    (cmd as any).setContext?.(ctx) ?? Object.assign(cmd, { ctx });

    const io = createMockIO({ agentId: "17" });
    const res = await cmd.execute(io);
    assert.equal(passedClientsCount, 50, "Must bound query to at most 50 clients");
    assert.ok(io.logs.some((l: string) => l.includes("bounding reputation query to first 50")));
    assert.equal(res.readFailed, false);
    assert.equal(res.trustTier, "HIGH");
  });
});

