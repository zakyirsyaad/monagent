import { encodeFunctionData } from "viem";
import {
  resolveChain,
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
import { PluginCommand, schemaToArgs } from "@metamask/agent-wallet/plugin";

export interface RefundJobResult {
  jobId: string;
  transactionHash: `0x${string}`;
  chainId: number;
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
    chainId: {
      type: InputFieldType.Text,
      flag: "chain-id",
      aliases: ["chainId"],
      message: "Monad chain ID (10143 for testnet, 143 for mainnet)",
      required: false,
      prompt: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);
  static args = schemaToArgs(this.inputs);

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
    const chain = resolveChain(rawInputs.chainId as any);

    if (!chain.escrow) {
      throw new CommandError(
        "ESCROW_NOT_DEPLOYED",
        `MonadA2AEscrow is not deployed on Monad chain ${chain.chainId}. Escrow is currently available on Monad Testnet (10143).`,
        "Specify --chain-id 10143 to interact with escrow contracts."
      );
    }

    io.emit(`Refunding expired escrow for Job #${jobId} on ${chain.name}...`);

    const data = encodeFunctionData({
      abi: monadEscrowAbi,
      functionName: "refundExpiredJob",
      args: [BigInt(jobId)],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: chain.chainId,
      to: chain.escrow,
      data,
    });

    io.emit(`Job #${jobId} escrow refunded on ${chain.name}! TxHash: ${hash}`);
    io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

    return {
      jobId,
      transactionHash: hash,
      chainId: chain.chainId,
    };
  }
}
