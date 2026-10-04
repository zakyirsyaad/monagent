import { encodeFunctionData } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
  monadEscrowAbi,
  monadRefundJobSchema,
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

export interface RefundJobResult {
  jobId: string;
  transactionHash: `0x${string}`;
}

export class MonadJobsRefundCommand extends BaseMonadPluginCommand<RefundJobResult> {
  static description = "Refund an expired subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:refund";

  public static readonly inputs: InputSchema = {
    jobId: {
      type: InputFieldType.Text,
      flag: "jobId",
      message: "Escrow job ID to refund after deadline",
      required: true,
      index: 0,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<RefundJobResult> {
    const rawInputs = await io.resolveInputs(MonadJobsRefundCommand.inputs);
    const parsed = monadRefundJobSchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid refund job input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide a numeric jobId."
      );
    }
    const { jobId } = parsed.data;

    io.emit(`Refunding expired escrow for Job #${jobId}...`);

    const data = encodeFunctionData({
      abi: monadEscrowAbi,
      functionName: "refundExpiredJob",
      args: [BigInt(jobId)],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      data,
    });

    io.emit(`Job #${jobId} escrow refunded on Monad! TxHash: ${hash}`);

    return {
      jobId,
      transactionHash: hash,
    };
  }
}
