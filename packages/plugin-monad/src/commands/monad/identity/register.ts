import { encodeFunctionData, parseAbi } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  monadAgentCardSchema,
  type MonadAgentCard,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, executeTransaction } from "../../../sdk.js";

const erc8004IdentityAbi = parseAbi([
  "function registerAgent(string name, string description, address walletAddress, string endpoint) returns (uint256 agentId)",
  "function getAgent(uint256 agentId) view returns ((string name, string description, address walletAddress, string endpoint, uint256 createdAt, bool active))",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

export interface RegisterIdentityResult {
  transactionHash: `0x${string}`;
  agentCard: MonadAgentCard;
  registryAddress: string;
}

export class MonadIdentityRegisterCommand extends BaseMonadPluginCommand<RegisterIdentityResult> {
  static override description = "Register an AI Agent identity on Monad Testnet ERC-8004 Registry";
  protected override readonly pluginCommandId = "monad:identity:register";

  async execute(io: CommandIO): Promise<RegisterIdentityResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadAgentCardSchema);
    const card = monadAgentCardSchema.parse(rawInputs);

    const agentUri = `data:application/json;utf8,${encodeURIComponent(JSON.stringify(card))}`;

    const data = encodeFunctionData({
      abi: erc8004IdentityAbi,
      functionName: "registerAgent",
      args: [
        card.name,
        card.description,
        card.walletAddress as `0x${string}`,
        card.endpoints[0] || "https://agent.xyz",
      ],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
      data,
    });

    io.log(`Agent identity registered on Monad! TxHash: ${hash}`);

    return {
      transactionHash: hash,
      agentCard: card,
      registryAddress: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
    };
  }
}
