import { encodeFunctionData, parseAbi, parseEther } from "viem";
import { z } from "zod";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
} from "@zakyirsyaad/monagent-shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

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

export class MonadJobsCreateCommand extends PluginCommand<CreateJobResult> {
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

    const executor = this.ctx.walletExecutor(io, this.pluginCommandId);
    const tx = await executor({
      kind: "transaction",
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      value: parseEther(bountyMon),
      data,
    });

    if (tx.status !== "success" || !tx.hash) {
      throw new Error(`Failed to fund job escrow on Monad: status ${tx.status}`);
    }

    const jobId = `job_${Date.now()}_${tx.hash.slice(2, 10)}`;
    io.log(`Job escrow funded on Monad! JobId: ${jobId}, Tx: ${tx.hash}`);


    return {
      jobId,
      workerAddress,
      bountyMon,
      taskDescription,
      escrowTransactionHash: tx.hash,
    };
  }
}
