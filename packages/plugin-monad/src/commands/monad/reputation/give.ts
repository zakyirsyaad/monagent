import { encodeFunctionData, keccak256, toHex } from "viem";
import {
  resolveChain,
  erc8004ReputationAbi,
  monadReputationFeedbackSchema,
  type MonadReputationFeedback,
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

export interface GiveReputationResult {
  transactionHash: `0x${string}`;
  feedback: MonadReputationFeedback;
  registryAddress: string;
  chainId: number;
}

export class MonadReputationGiveCommand extends BaseMonadPluginCommand<GiveReputationResult> {
  static description = "Submit on-chain peer feedback to Monad ERC-8004 Reputation Registry";
  protected override readonly pluginCommandId = "monad:reputation:give";

  public static readonly inputs: InputSchema = {
    agentId: {
      type: InputFieldType.Text,
      flag: "agentId",
      message: "Target agent ID in ERC-8004 registry",
      required: true,
    },
    value: {
      type: InputFieldType.Text,
      flag: "value",
      message: "Feedback score (-100 to 100)",
      required: true,
    },
    decimals: {
      type: InputFieldType.Text,
      flag: "decimals",
      message: "Decimals for score (default 0)",
      required: false,
    },
    tag1: {
      type: InputFieldType.Text,
      flag: "tag1",
      message: "Primary feedback category tag (e.g. speed)",
      required: false,
    },
    tag2: {
      type: InputFieldType.Text,
      flag: "tag2",
      message: "Secondary category tag (e.g. accuracy)",
      required: false,
    },
    endpoint: {
      type: InputFieldType.Text,
      flag: "endpoint",
      message: "Service endpoint that performed the task",
      required: false,
    },
    feedbackURI: {
      type: InputFieldType.Text,
      flag: "feedbackURI",
      message: "URI pointing to detailed review or task proof",
      required: false,
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

  async execute(io: CommandIO): Promise<GiveReputationResult> {
    const rawInputs = await io.resolveInputs(MonadReputationGiveCommand.inputs);
    const parsed = monadReputationFeedbackSchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid feedback input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide a numeric agentId and score between -100 and 100."
      );
    }
    const feedback = parsed.data;
    const chain = resolveChain(rawInputs.chainId as any);

    const feedbackHash = feedback.feedbackURI
      ? keccak256(toHex(feedback.feedbackURI))
      : keccak256(toHex("feedback"));

    const data = encodeFunctionData({
      abi: erc8004ReputationAbi,
      functionName: "giveFeedback",
      args: [
        BigInt(feedback.agentId),
        BigInt(feedback.value),
        feedback.decimals,
        feedback.tag1,
        feedback.tag2,
        feedback.endpoint,
        feedback.feedbackURI,
        feedbackHash,
      ],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: chain.chainId,
      to: chain.reputationRegistry,
      data,
    });

    io.emit(`Feedback submitted for Agent #${feedback.agentId} on ${chain.name}! Score: ${feedback.value}. TxHash: ${hash}`);
    io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

    return {
      transactionHash: hash,
      feedback,
      registryAddress: chain.reputationRegistry,
      chainId: chain.chainId,
    };
  }
}
