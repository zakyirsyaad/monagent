import { parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  monadAgentCardSchema,
  type MonadAgentCard,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO } from "../../../sdk.js";

const erc8004IdentityAbi = parseAbi([
  "function getAgent(uint256 agentId) view returns ((string name, string description, address walletAddress, string endpoint, uint256 createdAt, bool active))",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

const getIdentityInputSchema = z.object({
  agentId: z.string().regex(/^\d+$/, "agentId must be a numeric string"),
});

export interface GetIdentityResult {
  agentId: string;
  owner: string;
  walletAddress: string;
  card?: MonadAgentCard;
}

export class MonadIdentityGetCommand extends BaseMonadPluginCommand<GetIdentityResult> {
  static override description = "Get agent identity details from Monad Testnet ERC-8004 Registry";
  protected override readonly pluginCommandId = "monad:identity:get";
  async execute(io: CommandIO): Promise<GetIdentityResult> {
    const rawInputs = await io.resolveInputs<unknown>(getIdentityInputSchema);
    const { agentId } = getIdentityInputSchema.parse(rawInputs);

    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const tokenIdBigInt = BigInt(agentId);

    const [owner, agentDetails] = await Promise.all([
      client.readContract({
        address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityAbi,
        functionName: "ownerOf",
        args: [tokenIdBigInt],
      }),
      client.readContract({
        address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityAbi,
        functionName: "getAgent",
        args: [tokenIdBigInt],
      }),
    ]);

    const card: MonadAgentCard = {
      name: agentDetails.name,
      description: agentDetails.description,
      walletAddress: agentDetails.walletAddress,
      endpoints: [agentDetails.endpoint],
      supportedProtocols: ["mcp", "x402"],
      active: agentDetails.active,
    };
    const walletAddress = agentDetails.walletAddress;

    return {
      agentId,
      owner,
      walletAddress,
      card,
    };
  }
}
