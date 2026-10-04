import { parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
} from "@monagent/shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

const erc8004ReputationAbi = parseAbi([
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
]);

const checkReputationInputSchema = z.object({
  agentId: z.string().regex(/^\d+$/, "agentId must be a numeric string"),
  tag1: z.string().default(""),
  tag2: z.string().default(""),
});

export interface CheckReputationResult {
  agentId: string;
  feedbackCount: number;
  averageScore: number;
  trustTier: "HIGH" | "MEDIUM" | "LOW" | "UNRATED";
}

export class MonadReputationCheckCommand extends PluginCommand<CheckReputationResult> {
  static override description = "Check peer agent reputation on Monad ERC-8004 Reputation Registry";
  protected override readonly pluginCommandId = "monad:reputation:check";

  async execute(io: CommandIO): Promise<CheckReputationResult> {
    const rawInputs = await io.resolveInputs<unknown>(checkReputationInputSchema);
    const { agentId, tag1, tag2 } = checkReputationInputSchema.parse(rawInputs);

    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const tokenIdBigInt = BigInt(agentId);

    const [count, summaryValue, decimals] = await client.readContract({
      address: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
      abi: erc8004ReputationAbi,
      functionName: "getSummary",
      args: [tokenIdBigInt, [], tag1, tag2],
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
