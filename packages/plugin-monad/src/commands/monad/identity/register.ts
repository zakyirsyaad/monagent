import { encodeFunctionData, parseEventLogs } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
  erc8004IdentityAbi,
  monadAgentCardSchema,
  type MonadAgentCard,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
  executeTransaction,
} from "../../../sdk.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface RegisterIdentityResult {
  transactionHash: `0x${string}`;
  agentId: string;
  agentCard: MonadAgentCard;
  registryAddress: string;
}

export class MonadIdentityRegisterCommand extends BaseMonadPluginCommand<RegisterIdentityResult> {
  static description = "Register an AI Agent identity on Monad Testnet ERC-8004 Registry";
  protected override readonly pluginCommandId = "monad:identity:register";

  public static readonly inputs: InputSchema = {
    name: {
      type: InputFieldType.Text,
      flag: "name",
      message: "Human-readable agent name",
      required: true,
    },
    description: {
      type: InputFieldType.Text,
      flag: "description",
      message: "Agent description and capabilities",
      required: true,
    },
    walletAddress: {
      type: InputFieldType.Text,
      flag: "walletAddress",
      message: "Agent operational EVM wallet address",
      required: true,
    },
    endpoint: {
      type: InputFieldType.Text,
      flag: "endpoint",
      message: "Primary service endpoint URL",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<RegisterIdentityResult> {
    const rawInputs = await io.resolveInputs(MonadIdentityRegisterCommand.inputs);
    const cardInput = {
      name: rawInputs.name,
      description: rawInputs.description,
      walletAddress: rawInputs.walletAddress,
      endpoints: [rawInputs.endpoint || "https://agent.xyz"],
      supportedProtocols: ["mcp", "x402"],
      active: true,
    };

    const parsedCard = monadAgentCardSchema.safeParse(cardInput);
    if (!parsedCard.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid agent card input: ${parsedCard.error.issues.map((i) => i.message).join(", ")}`,
        "Check agent name, description, wallet address, and endpoint."
      );
    }
    const card = parsedCard.data;

    // Build standard ERC-8004 Registration JSON data URI
    const registrationJson = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: card.name,
      description: card.description,
      image: "https://i.imgur.com/JQxM4nO.png",
      services: [
        {
          name: "A2A",
          endpoint: card.endpoints[0],
          version: "0.3.0",
        },
        {
          name: "MCP",
          endpoint: `${card.endpoints[0]}/mcp`,
          version: "2025-06-18",
        },
      ],
      x402Support: card.supportedProtocols.includes("x402"),
      active: card.active,
      registrations: [],
      supportedTrust: ["reputation"],
    };

    const agentUri = `data:application/json;base64,${Buffer.from(
      JSON.stringify(registrationJson)
    ).toString("base64")}`;

    const data = encodeFunctionData({
      abi: erc8004IdentityAbi,
      functionName: "register",
      args: [agentUri],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
      data,
    });

    // Extract agentId from Registered event log
    let onChainAgentId: string;
    try {
      const client = this.getPublicClient(MONAD_TESTNET_CHAIN_ID);
      const receipt = await client.waitForTransactionReceipt({ hash });
      const logs = parseEventLogs({
        abi: erc8004IdentityAbi,
        logs: receipt.logs,
        eventName: "Registered",
      });
      if (logs.length > 0 && logs[0].args.agentId !== undefined) {
        onChainAgentId = logs[0].args.agentId.toString();
      } else {
        throw new Error("Registered event not found in receipt");
      }
    } catch (err: any) {
      throw new CommandError(
        "RECEIPT_PARSING_FAILED",
        `Agent registration confirmed in tx ${hash}, but Registered event log could not be parsed: ${err?.message || String(err)}`,
        "Check transaction on Monad Explorer."
      );
    }

    io.emit(`Agent #${onChainAgentId} registered on Monad ERC-8004 Registry! TxHash: ${hash}`);

    return {
      transactionHash: hash,
      agentId: onChainAgentId,
      agentCard: card,
      registryAddress: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
    };
  }
}
