import { encodeFunctionData } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_DEPLOYED_A2A_ESCROW,
  monadEscrowAbi,
  monadCompleteJobSchema,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
  executeTransaction,
} from "../../../sdk.js";
import { PluginCommand, schemaToArgs } from "@metamask/agent-wallet/plugin";

export interface CompleteJobResult {
  jobId: string;
  resultURI: string;
  transactionHash: `0x${string}`;
}

export class MonadJobsCompleteCommand extends BaseMonadPluginCommand<CompleteJobResult> {
  static description = "Complete and release a subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:complete";

  public static readonly inputs: InputSchema = {
    jobId: {
      type: InputFieldType.Text,
      flag: "jobId",
      message: "Escrow job ID to complete",
      required: true,
      index: 0,
    },
    resultURI: {
      type: InputFieldType.Text,
      flag: "resultURI",
      message: "Deliverable URI or proof hash",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);
  static args = schemaToArgs(this.inputs);

  async execute(io: CommandIO): Promise<CompleteJobResult> {
    const rawInputs = await io.resolveInputs(MonadJobsCompleteCommand.inputs);
    const parsed = monadCompleteJobSchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid complete job input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide a numeric jobId and optional resultURI."
      );
    }
    const { jobId, resultURI } = parsed.data;

    io.emit(`Releasing escrow for Job #${jobId}...`);

    const data = encodeFunctionData({
      abi: monadEscrowAbi,
      functionName: "completeJob",
      args: [BigInt(jobId), resultURI],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: MONAD_DEPLOYED_A2A_ESCROW,
      data,
    });

    io.emit(`Job #${jobId} escrow released and settled on Monad! TxHash: ${hash}`);

    return {
      jobId,
      resultURI,
      transactionHash: hash,
    };
  }
}
