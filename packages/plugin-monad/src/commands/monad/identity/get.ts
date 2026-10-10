import {
  resolveChain,
  erc8004IdentityAbi,
  type MonadAgentCard,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
} from "../../../sdk.js";
import { resolveAgentCard } from "../../../card-resolver.js";
import { PluginCommand, schemaToArgs } from "@metamask/agent-wallet/plugin";

export interface GetIdentityResult {
  agentId: string;
  owner: string;
  walletAddress: string;
  card?: MonadAgentCard;
  cardUri?: string;
  cardParseError?: string;
  chainId: number;
}

export class MonadIdentityGetCommand extends BaseMonadPluginCommand<GetIdentityResult> {
  static description = "Get agent identity details from Monad ERC-8004 Registry";
  static requiresAuth = false;
  static requiresInit = false;
  protected override readonly pluginCommandId = "monad:identity:get";

  public static readonly inputs: InputSchema = {
    agentId: {
      type: InputFieldType.Text,
      flag: "agentId",
      message: "Agent token ID in ERC-8004 registry",
      required: true,
      index: 0,
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

  async execute(io: CommandIO): Promise<GetIdentityResult> {
    const rawInputs = await io.resolveInputs(MonadIdentityGetCommand.inputs);
    const agentId = String(rawInputs.agentId).trim();
    if (!/^\d+$/.test(agentId)) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid agentId "${agentId}". Must be a numeric string.`,
        "Provide a valid agent ID number (e.g. 1)."
      );
    }
    const chain = resolveChain(rawInputs.chainId as any);

    const client = this.getPublicClient(chain.chainId);
    const tokenIdBigInt = BigInt(agentId);

    let owner: string;
    let walletAddress: string;
    let tokenUri: string;

    const registryAddress = chain.identityRegistry;

    try {
      [owner, walletAddress, tokenUri] = await Promise.all([
        client.readContract({
          address: registryAddress,
          abi: erc8004IdentityAbi,
          functionName: "ownerOf",
          args: [tokenIdBigInt],
        }),
        client.readContract({
          address: registryAddress,
          abi: erc8004IdentityAbi,
          functionName: "getAgentWallet",
          args: [tokenIdBigInt],
        }),
        client.readContract({
          address: registryAddress,
          abi: erc8004IdentityAbi,
          functionName: "tokenURI",
          args: [tokenIdBigInt],
        }),
      ]);
    } catch (err: any) {
      throw new CommandError(
        "AGENT_NOT_FOUND",
        `Failed to fetch Agent #${agentId} from Monad ERC-8004 Registry (${registryAddress} on chain ${chain.chainId}): ${err?.message || String(err)}`,
        "Verify the agentId exists on the specified chain."
      );
    }

    const lookupFn = (this.ctx as any)?.dnsLookup;
    const fetchFn = (this.ctx as any)?.fetchFn;
    const { card, cardUri, cardParseError } = await resolveAgentCard(
      tokenUri,
      walletAddress,
      agentId,
      { lookup: lookupFn, fetchFn }
    );

    let statusLine = `Agent #${agentId}: Owner: ${owner}, Wallet: ${walletAddress}`;
    if (card?.name) {
      statusLine += `, Name: ${card.name}`;
    } else if (cardParseError) {
      statusLine += `, Name: N/A (Card unreadable: ${cardParseError})`;
    } else {
      statusLine += `, Name: N/A`;
    }
    io.emit(statusLine);

    return {
      agentId,
      owner,
      walletAddress,
      card,
      cardUri,
      cardParseError,
      chainId: chain.chainId,
    };
  }
}
