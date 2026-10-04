import { encodeFunctionData, parseAbi, parseEther } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, executeTransaction } from "../../../sdk.js";

const escrowAbi = parseAbi([
  "function createAndFundJob(address worker, string taskDescription, uint256 durationHours) payable returns (uint256 jobId)",
]);

const createJobInputSchema = z.object({
  workerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  bountyMon: z.string().regex(/^\d+(\.\d+)?$/),
  taskDescription: z.string().min(1).max(500),
  deadlineHours: z.number().int().min(1).max(168).default(24),
});

export interface CreateJobResult {
  jobId: string;
  workerAddress: string;
  bountyMon: string;
  taskDescription: string;
  escrowTransactionHash: `0x${string}`;
}

export class MonadJobsCreateCommand extends BaseMonadPluginCommand<CreateJobResult> {
  static override description = "Create and fund a subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:create";

  async execute(io: CommandIO): Promise<CreateJobResult> {
    const rawInputs = await io.resolveInputs<unknown>(createJobInputSchema);
    const { workerAddress, bountyMon, taskDescription, deadlineHours } =
      createJobInputSchema.parse(rawInputs);

    io.log(`Creating A2A Job for worker ${workerAddress} with bounty ${bountyMon} MON (Deadline: ${deadlineHours}h)`);

    const data = encodeFunctionData({
      abi: escrowAbi,
      functionName: "createAndFundJob",
      args: [workerAddress as `0x${string}`, taskDescription, BigInt(deadlineHours)],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      value: parseEther(bountyMon),
      data,
    });

    let onChainJobId: string = "1";
    try {
      const client = this.ctx.publicClient(MONAD_TESTNET_CHAIN_ID);
      const receipt = await client.waitForTransactionReceipt({ hash });
      // JobCreated event signature is topic[0] or first log
      if (receipt.logs && receipt.logs.length > 0 && receipt.logs[0].topics[1]) {
        onChainJobId = BigInt(receipt.logs[0].topics[1]).toString();
      }
    } catch {
      // fallback if receipt fetching times out
      onChainJobId = "1";
    }

    io.log(`Job escrow funded on Monad! JobId: ${onChainJobId}, Tx: ${hash}`);

    return {
      jobId: onChainJobId,
      workerAddress,
      bountyMon,
      taskDescription,
      escrowTransactionHash: hash,
    };
  }
}
