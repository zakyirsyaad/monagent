import { encodeFunctionData, parseAbi } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  monadAgentCardSchema,
  type MonadAgentCard,
} from "@monagent/shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

const erc8004IdentityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

export interface RegisterIdentityResult {
  transactionHash: `0x${string}`;
  agentCard: MonadAgentCard;
  registryAddress: string;
}

export class MonadIdentityRegisterCommand extends PluginCommand<RegisterIdentityResult> {
  static override description = "Register an AI Agent identity on Monad Testnet ERC-8004 Registry";
  protected override readonly pluginCommandId = "monad:identity:register";

  async execute(io: CommandIO): Promise<RegisterIdentityResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadAgentCardSchema);
    const card = monadAgentCardSchema.parse(rawInputs);

    const agentUri = `data:application/json;utf8,${encodeURIComponent(JSON.stringify(card))}`;

    const data = encodeFunctionData({
      abi: erc8004IdentityAbi,
      functionName: "register",
      args: [agentUri],
    });

    const executor = this.ctx.walletExecutor(io, this.pluginCommandId);
    const result = await executor({
      kind: "transaction",
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
      data,
    });

    if (result.status !== "success" || !result.hash) {
      throw new Error(`Failed to register agent identity on Monad: status ${result.status}`);
    }

    io.log(`Agent identity registered on Monad! TxHash: ${result.hash}`);

    return {
      transactionHash: result.hash,
      agentCard: card,
      registryAddress: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
    };
  }
}
