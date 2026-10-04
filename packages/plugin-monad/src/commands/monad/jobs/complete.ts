import { encodeFunctionData, parseAbi } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, executeTransaction } from "../../../sdk.js";

const escrowAbi = parseAbi([
  "function completeJob(uint256 jobId, string calldata resultURI) external",
]);

const completeJobInputSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
  resultURI: z.string().default("ipfs://settled"),
});

export interface CompleteJobResult {
  jobId: string;
  resultURI: string;
  transactionHash: `0x${string}`;
}

export class MonadJobsCompleteCommand extends BaseMonadPluginCommand<CompleteJobResult> {
  static override description = "Complete and release a subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:complete";

  async execute(io: CommandIO): Promise<CompleteJobResult> {
    const rawInputs = await io.resolveInputs<unknown>(completeJobInputSchema);
    const { jobId, resultURI } = completeJobInputSchema.parse(rawInputs);

    io.log(`Releasing escrow for Job #${jobId}...`);

    const data = encodeFunctionData({
      abi: escrowAbi,
      functionName: "completeJob",
      args: [BigInt(jobId), resultURI],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      data,
    });

    io.log(`Job #${jobId} escrow released and settled on Monad! TxHash: ${hash}`);

    return {
      jobId,
      resultURI,
      transactionHash: hash,
    };
  }
}
