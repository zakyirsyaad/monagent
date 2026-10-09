import { encodeFunctionData } from "viem";
import {
  resolveChain,
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
  chainId: number;
  confirmed: boolean;
  status: "CONFIRMED" | "SUBMITTED";
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
      prompt: false,
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
    const chain = resolveChain(rawInputs.chainId as any);

    if (!chain.escrow) {
      throw new CommandError(
        "ESCROW_NOT_DEPLOYED",
        `MonadA2AEscrow is not deployed on Monad chain ${chain.chainId}. Escrow is currently available on Monad Testnet (10143).`,
        "Specify --chain-id 10143 to interact with escrow contracts."
      );
    }

    io.emit(`Releasing escrow for Job #${jobId} on ${chain.name}...`);

    const data = encodeFunctionData({
      abi: monadEscrowAbi,
      functionName: "completeJob",
      args: [BigInt(jobId), resultURI],
    });

    const { hash } = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: chain.chainId,
      to: chain.escrow,
      data,
    });

    io.emit(`Escrow release transaction submitted for Job #${jobId} on ${chain.name}, pending confirmation... TxHash: ${hash}`);

    const client = this.getPublicClient(chain.chainId);
    let receipt: any = null;
    let timedOut = false;

    try {
      receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 15_000,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        err?.name === "WaitForTransactionReceiptTimeoutError" ||
        errMsg.toLowerCase().includes("timed out") ||
        errMsg.toLowerCase().includes("timeout")
      ) {
        timedOut = true;
      } else {
        throw err;
      }
    }

    if (timedOut || !receipt) {
      io.emit(`Escrow release transaction submitted for Job #${jobId} on ${chain.name}, but confirmation timed out. Status: SUBMITTED (unconfirmed). TxHash: ${hash}`);
      io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

      return {
        jobId,
        resultURI,
        transactionHash: hash,
        chainId: chain.chainId,
        confirmed: false,
        status: "SUBMITTED",
      };
    }

    if (receipt.status === "reverted") {
      throw new CommandError(
        "TRANSACTION_REVERTED",
        `Job #${jobId} escrow release reverted on-chain: ${hash}. Explorer: ${chain.explorerUrl}/tx/${hash}`,
        "Check transaction on Monad Explorer and verify job status and caller authorization."
      );
    }

    io.emit(`Job #${jobId} escrow released and settled on ${chain.name}! TxHash: ${hash}`);
    io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

    return {
      jobId,
      resultURI,
      transactionHash: hash,
      chainId: chain.chainId,
      confirmed: true,
      status: "CONFIRMED",
    };
  }
}
