import { encodeFunctionData, parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, executeTransaction } from "../../../sdk.js";

const escrowAbi = parseAbi([
  "function refundExpiredJob(uint256 jobId) external",
]);

const refundJobInputSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
});

export interface RefundJobResult {
  jobId: string;
  transactionHash: `0x${string}`;
}

export class MonadJobsRefundCommand extends BaseMonadPluginCommand<RefundJobResult> {
  static override description = "Refund an expired subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:refund";

  async execute(io: CommandIO): Promise<RefundJobResult> {
    const rawInputs = await io.resolveInputs<unknown>(refundJobInputSchema);
    const { jobId } = refundJobInputSchema.parse(rawInputs);

    io.log(`Refunding expired escrow for Job #${jobId}...`);

    const data = encodeFunctionData({
      abi: escrowAbi,
      functionName: "refundExpiredJob",
      args: [BigInt(jobId)],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      data,
    });

    io.log(`Job #${jobId} escrow refunded on Monad! TxHash: ${hash}`);

    return {
      jobId,
      transactionHash: hash,
    };
  }
}
