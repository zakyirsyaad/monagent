import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
  erc8004ReputationAbi,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
} from "../../../sdk.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface CheckReputationResult {
  agentId: string;
  feedbackCount: number;
  averageScore: number;
  trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED";
}

export class MonadReputationCheckCommand extends BaseMonadPluginCommand<CheckReputationResult> {
  static description = "Check peer agent reputation on Monad ERC-8004 Reputation Registry";
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
      default: "",
      required: false,
    },
    tag2: {
      type: InputFieldType.Text,
      flag: "tag2",
      message: "Filter by secondary category tag (e.g. task)",
      default: "",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

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

    const client = this.getPublicClient(MONAD_TESTNET_CHAIN_ID);
    const tokenIdBigInt = BigInt(agentId);

    // Official ERC-8004 requires clientAddresses array (reverts if empty without getClients)
    let clientsToQuery: `0x${string}`[] = [];
    try {
      const registeredClients = await client.readContract({
        address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
        abi: erc8004ReputationAbi,
        functionName: "getClients",
        args: [tokenIdBigInt],
      });
      if (registeredClients && Array.isArray(registeredClients)) {
        clientsToQuery = registeredClients as `0x${string}`[];
      }
    } catch {
      // Contract might have no clients or call failed
    }

    let feedbackCount = 0;
    let averageScore = 0;

    if (clientsToQuery.length > 0) {
      try {
        const [count, summaryValue, decimals] = await client.readContract({
          address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
          abi: erc8004ReputationAbi,
          functionName: "getSummary",
          args: [tokenIdBigInt, clientsToQuery, tag1, tag2],
        });

        feedbackCount = Number(count);
        const scoreDivider = 10 ** decimals;
        averageScore =
          feedbackCount > 0 ? Number(summaryValue) / (feedbackCount * scoreDivider) : 0;
      } catch {
        // Fallback to unrated if getSummary reverts
      }
    }

    let trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED" = "UNRATED";
    if (feedbackCount > 0) {
      if (averageScore >= 80) trustTier = "HIGH";
      else if (averageScore >= 50) trustTier = "MEDIUM";
      else trustTier = "LOW";
    }

    io.emit(
      `Agent #${agentId} Reputation: ${feedbackCount} reviews, Average: ${averageScore.toFixed(1)}, Trust Tier: ${trustTier}`
    );

    return {
      agentId,
      feedbackCount,
      averageScore,
      trustTier,
    };
  }
}
