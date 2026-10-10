import {
  resolveChain,
  erc8004ReputationAbi,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
} from "../../../sdk.js";
import { PluginCommand, schemaToArgs } from "@metamask/agent-wallet/plugin";

export interface CheckReputationResult {
  agentId: string;
  feedbackCount: number;
  averageScore: number;
  trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED" | "UNKNOWN";
  readFailed: boolean;
  readError?: string;
  _notice?: {
    code: string;
    message: string;
  };
  chainId: number;
}

export class MonadReputationCheckCommand extends BaseMonadPluginCommand<CheckReputationResult> {
  static description = "Check peer agent reputation on Monad ERC-8004 Reputation Registry";
  static requiresAuth = false;
  static requiresInit = false;
  protected override readonly pluginCommandId = "monad:reputation:check";

  public static readonly inputs: InputSchema = {
    agentId: {
      type: InputFieldType.Text,
      flag: "agentId",
      message: "Agent token ID in ERC-8004 registry",
      required: true,
      index: 0,
    },
    tag1: {
      type: InputFieldType.Text,
      flag: "tag1",
      message: "Filter by primary category tag (e.g. speed)",
      required: false,
      prompt: false,
    },
    tag2: {
      type: InputFieldType.Text,
      flag: "tag2",
      message: "Filter by secondary category tag (e.g. task)",
      required: false,
      prompt: false,
    },
    chainId: {
      type: InputFieldType.Text,
      flag: "chain-id",
      aliases: ["chainId"],
      message: "Monad chain ID (10143 for testnet, 143 for mainnet)",
      required: false,
      prompt: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);
  static args = schemaToArgs(this.inputs);

  async execute(io: CommandIO): Promise<CheckReputationResult> {
    const rawInputs = await io.resolveInputs(MonadReputationCheckCommand.inputs);
    const agentId = String(rawInputs.agentId).trim();
    if (!/^\d+$/.test(agentId)) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid agentId "${agentId}". Must be a numeric string.`,
        "Provide a valid agent ID number (e.g. 1)."
      );
    }
    const tag1 = rawInputs.tag1 || "";
    const tag2 = rawInputs.tag2 || "";
    const chain = resolveChain(rawInputs.chainId as any);

    const client = this.getPublicClient(chain.chainId);
    const tokenIdBigInt = BigInt(agentId);

    const MAX_CLIENTS_TO_QUERY = 50;
    let clientsToQuery: `0x${string}`[] = [];
    let readFailed = false;
    let readError: string | undefined;

    // Official ERC-8004 requires clientAddresses array (reverts if empty without getClients)
    try {
      const registeredClients = await client.readContract({
        address: chain.reputationRegistry,
        abi: erc8004ReputationAbi,
        functionName: "getClients",
        args: [tokenIdBigInt],
      });
      if (registeredClients && Array.isArray(registeredClients)) {
        if (registeredClients.length > MAX_CLIENTS_TO_QUERY) {
          io.emit(
            `Agent #${agentId} has ${registeredClients.length} clients; bounding reputation query to first ${MAX_CLIENTS_TO_QUERY}.`
          );
        }
        clientsToQuery = registeredClients.slice(0, MAX_CLIENTS_TO_QUERY) as `0x${string}`[];
      }
    } catch (err: any) {
      readFailed = true;
      readError = `Failed to query registered clients from registry: ${err?.message || String(err)}`;
    }

    let feedbackCount = 0;
    let averageScore = 0;

    if (!readFailed && clientsToQuery.length > 0) {
      try {
        const [count, summaryValue, decimals] = await client.readContract({
          address: chain.reputationRegistry,
          abi: erc8004ReputationAbi,
          functionName: "getSummary",
          args: [tokenIdBigInt, clientsToQuery, tag1, tag2],
        });

        feedbackCount = Number(count);
        const scoreDivider = 10 ** decimals;
        averageScore =
          feedbackCount > 0 ? Number(summaryValue) / (feedbackCount * scoreDivider) : 0;
      } catch (err: any) {
        readFailed = true;
        readError = `Failed to query reputation summary from registry: ${err?.message || String(err)}`;
      }
    }

    let trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED" | "UNKNOWN" = "UNRATED";
    let notice: { code: string; message: string } | undefined;

    if (readFailed) {
      trustTier = "UNKNOWN";
      notice = {
        code: "REPUTATION_UNAVAILABLE",
        message: readError || "Reputation registry read failed",
      };
      io.emit(
        `WARN: REPUTATION_UNAVAILABLE: Failed to inspect reputation for Agent #${agentId} on ${chain.name}: ${readError}`
      );
      io.emit(
        `Agent #${agentId} Reputation on ${chain.name}: UNKNOWN (Read failed: ${readError})`
      );
    } else {
      if (feedbackCount > 0) {
        if (averageScore >= 80) trustTier = "HIGH";
        else if (averageScore >= 50) trustTier = "MEDIUM";
        else trustTier = "LOW";
      } else {
        trustTier = "UNRATED";
      }

      io.emit(
        `Agent #${agentId} Reputation on ${chain.name}: ${feedbackCount} reviews, Average: ${averageScore.toFixed(1)}, Trust Tier: ${trustTier}`
      );
    }

    return {
      agentId,
      feedbackCount,
      averageScore,
      trustTier,
      readFailed,
      ...(readError ? { readError } : {}),
      ...(notice ? { _notice: notice } : {}),
      chainId: chain.chainId,
    };
  }
}
