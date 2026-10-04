import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
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
import { PluginCommand, schemaToArgs } from "@metamask/agent-wallet/plugin";

export interface GetIdentityResult {
  agentId: string;
  owner: string;
  walletAddress: string;
  card?: MonadAgentCard;
}

export class MonadIdentityGetCommand extends BaseMonadPluginCommand<GetIdentityResult> {
  static description = "Get agent identity details from Monad Testnet ERC-8004 Registry";
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
      default: "10143",
      required: false,
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
    const chainId = Number(rawInputs.chainId || MONAD_TESTNET_CHAIN_ID);

    const client = this.getPublicClient(chainId);
    const tokenIdBigInt = BigInt(agentId);

    let owner: string;
    let walletAddress: string;
    let tokenUri: string;

    try {
      [owner, walletAddress, tokenUri] = await Promise.all([
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
    } catch (err: any) {
      throw new CommandError(
        "AGENT_NOT_FOUND",
        `Failed to fetch Agent #${agentId} from Monad ERC-8004 Registry: ${err?.message || String(err)}`,
        "Verify the agentId exists on Monad Testnet."
      );
    }

    let card: MonadAgentCard | undefined;
    try {
      let jsonString: string = "";
      if (tokenUri.startsWith("data:application/json;base64,")) {
        const base64Data = tokenUri.slice("data:application/json;base64,".length);
        jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
      } else if (tokenUri.startsWith("data:application/json;utf8,") || tokenUri.startsWith("data:application/json,")) {
        const urlEncoded = tokenUri.replace(/^data:application\/json(;utf8)?,/, "");
        jsonString = decodeURIComponent(urlEncoded);
      } else if (tokenUri.startsWith("{")) {
        jsonString = tokenUri;
      }

      if (jsonString) {
        const parsedJson = JSON.parse(jsonString);
        card = {
          name: parsedJson.name || `Agent #${agentId}`,
          description: parsedJson.description || "",
          walletAddress: walletAddress,
          endpoints: parsedJson.services?.map((s: any) => s.endpoint).filter(Boolean) || [
            parsedJson.endpoint || "",
          ],
          supportedProtocols: parsedJson.supportedProtocols || ["mcp", "x402"],
          active: parsedJson.active !== undefined ? Boolean(parsedJson.active) : true,
        };
      }
    } catch {
      // If parsing fails, create card with available contract data
      card = {
        name: `Agent #${agentId}`,
        description: "",
        walletAddress: walletAddress,
        endpoints: [],
        supportedProtocols: ["mcp", "x402"],
        active: true,
      };
    }

    io.emit(
      `Agent #${agentId}: Owner: ${owner}, Wallet: ${walletAddress}, Name: ${card?.name || "N/A"}`
    );

    return {
      agentId,
      owner,
      walletAddress,
      card,
    };
  }
}
