import { parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO } from "../../../sdk.js";

const erc8004ReputationAbi = parseAbi([
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getClients(uint256 agentId) view returns (address[])",
]);

const checkReputationInputSchema = z.object({
  agentId: z.string().regex(/^\d+$/, "agentId must be a numeric string"),
  clientAddresses: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).optional(),
  tag1: z.string().default(""),
  tag2: z.string().default(""),
});

export interface CheckReputationResult {
  agentId: string;
  feedbackCount: number;
  averageScore: number;
  trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED";
}
export class MonadReputationCheckCommand extends BaseMonadPluginCommand<CheckReputationResult> {
  static override description = "Check peer agent reputation on Monad ERC-8004 Reputation Registry";
  protected override readonly pluginCommandId = "monad:reputation:check";

  async execute(io: CommandIO): Promise<CheckReputationResult> {
    const rawInputs = await io.resolveInputs<unknown>(checkReputationInputSchema);
    const { agentId, clientAddresses, tag1, tag2 } = checkReputationInputSchema.parse(rawInputs);

    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const tokenIdBigInt = BigInt(agentId);

    let clientsToQuery: `0x${string}`[] = (clientAddresses as `0x${string}`[]) || [];
    if (clientsToQuery.length === 0) {
      try {
        const registeredClients = await client.readContract({
          address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
          abi: erc8004ReputationAbi,
          functionName: "getClients",
          args: [tokenIdBigInt],
        });
        if (registeredClients && registeredClients.length > 0) {
          clientsToQuery = registeredClients as `0x${string}`[];
        }
      } catch {
        // Contract might not support getClients or has no clients
      }
    }

    const [count, summaryValue, decimals] = await client.readContract({
      address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
      abi: erc8004ReputationAbi,
      functionName: "getSummary",
      args: [tokenIdBigInt, clientsToQuery, tag1, tag2],
    });

    const feedbackCount = Number(count);
    const scoreDivider = 10 ** decimals;
    const averageScore = feedbackCount > 0 ? Number(summaryValue) / (feedbackCount * scoreDivider) : 0;

    let trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED" = "UNRATED";
    if (feedbackCount > 0) {
      if (averageScore >= 80) trustTier = "HIGH";
      else if (averageScore >= 50) trustTier = "MEDIUM";
      else trustTier = "LOW";
    }

    return {
      agentId,
      feedbackCount,
      averageScore,
      trustTier,
    };
  }
}
