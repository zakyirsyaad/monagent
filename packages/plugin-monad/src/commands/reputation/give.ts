import { encodeFunctionData, keccak256, parseAbi, toHex } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
  monadReputationFeedbackSchema,
  type MonadReputationFeedback,
} from "@zakyirsyaad/monagent-shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

const erc8004ReputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

export interface GiveReputationResult {
  transactionHash: `0x${string}`;
  feedback: MonadReputationFeedback;
  registryAddress: string;
}

export class MonadReputationGiveCommand extends PluginCommand<GiveReputationResult> {
  static override description = "Submit on-chain peer feedback to Monad ERC-8004 Reputation Registry";
  protected override readonly pluginCommandId = "monad:reputation:give";

  async execute(io: CommandIO): Promise<GiveReputationResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadReputationFeedbackSchema);
    const feedback = monadReputationFeedbackSchema.parse(rawInputs);

    const feedbackHash = feedback.feedbackURI ? keccak256(toHex(feedback.feedbackURI)) : keccak256(toHex("feedback"));

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

    const executor = this.ctx.walletExecutor(io, this.pluginCommandId);
    const result = await executor({
      kind: "transaction",
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
      data,
    });

    if (result.status !== "success" || !result.hash) {
      throw new Error(`Failed to submit reputation feedback on Monad: status ${result.status}`);
    }

    io.log(`Feedback submitted on Monad! TxHash: ${result.hash}`);

    return {
      transactionHash: result.hash,
      feedback,
      registryAddress: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
    };
  }
}
