import { parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  monadAgentCardSchema,
  type MonadAgentCard,
} from "@monagent/shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

const erc8004IdentityAbi = parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
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

export class MonadIdentityGetCommand extends PluginCommand<GetIdentityResult> {
  static override description = "Get agent identity details from Monad Testnet ERC-8004 Registry";
  protected override readonly pluginCommandId = "monad:identity:get";

  async execute(io: CommandIO): Promise<GetIdentityResult> {
    const rawInputs = await io.resolveInputs<unknown>(getIdentityInputSchema);
    const { agentId } = getIdentityInputSchema.parse(rawInputs);

    const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
    const tokenIdBigInt = BigInt(agentId);

    const [owner, walletAddress, uri] = await Promise.all([
      client.readContract({
        address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityAbi,
        functionName: "ownerOf",
        args: [tokenIdBigInt],
      }),
      client.readContract({
        address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityAbi,
        functionName: "getAgentWallet",
        args: [tokenIdBigInt],
      }),
      client.readContract({
        address: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
        abi: erc8004IdentityAbi,
        functionName: "tokenURI",
        args: [tokenIdBigInt],
      }),
    ]);

    let card: MonadAgentCard | undefined;
    if (uri.startsWith("data:application/json;utf8,")) {
      try {
        const decoded = decodeURIComponent(uri.replace("data:application/json;utf8,", ""));
        const parsed = JSON.parse(decoded) as unknown;
        card = monadAgentCardSchema.parse(parsed);
      } catch {
        io.warn(`Could not parse agent metadata URI for agentId ${agentId}`);
      }
    }

    return {
      agentId,
      owner,
      walletAddress,
      card,
    };
  }
}
