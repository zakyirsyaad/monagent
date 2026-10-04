import { encodeFunctionData, parseEther, parseEventLogs } from "viem";
import {
  resolveChain,
  monadEscrowAbi,
  monadCreateJobSchema,
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

export interface CreateJobResult {
  jobId: string;
  workerAddress: string;
  bountyMon: string;
  taskDescription: string;
  escrowTransactionHash: `0x${string}`;
  chainId: number;
}

export class MonadJobsCreateCommand extends BaseMonadPluginCommand<CreateJobResult> {
  static description = "Create and fund a subcontracted A2A task escrow on Monad";
  protected override readonly pluginCommandId = "monad:jobs:create";

  public static readonly inputs: InputSchema = {
    workerAddress: {
      type: InputFieldType.Text,
      flag: "workerAddress",
      message: "Worker EVM address receiving the escrow bounty",
      required: true,
    },
    bountyMon: {
      type: InputFieldType.Text,
      flag: "bountyMon",
      message: "Bounty amount in native MON (e.g. 0.2)",
      required: true,
    },
    taskDescription: {
      type: InputFieldType.Text,
      flag: "taskDescription",
      message: "Clear deliverable description or specifications",
      required: true,
    },
    deadlineHours: {
      type: InputFieldType.Text,
      flag: "deadlineHours",
      message: "Review and task window in hours (default 24)",
      required: false,
    },
    chainId: {
      type: InputFieldType.Text,
      flag: "chain-id",
      aliases: ["chainId"],
      message: "Monad chain ID (10143 for testnet, 143 for mainnet)",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<CreateJobResult> {
    const rawInputs = await io.resolveInputs(MonadJobsCreateCommand.inputs);
    const parsed = monadCreateJobSchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid job creation input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide valid workerAddress, positive bountyMon, and taskDescription."
      );
    }
    const { workerAddress, bountyMon, taskDescription, deadlineHours } = parsed.data;
    const chain = resolveChain(rawInputs.chainId as any);

    if (!chain.escrow) {
      throw new CommandError(
        "ESCROW_NOT_DEPLOYED",
        `MonadA2AEscrow is not deployed on Monad chain ${chain.chainId}. Escrow is currently available on Monad Testnet (10143).`,
        "Specify --chain-id 10143 to interact with escrow contracts."
      );
    }

    io.emit(
      `Creating A2A Job on ${chain.name} for worker ${workerAddress} with bounty ${bountyMon} MON (Deadline: ${deadlineHours}h)...`
    );

    const data = encodeFunctionData({
      abi: monadEscrowAbi,
      functionName: "createAndFundJob",
      args: [workerAddress as `0x${string}`, taskDescription, BigInt(deadlineHours)],
    });

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: chain.chainId,
      to: chain.escrow,
      value: parseEther(bountyMon),
      data,
    });

    // Wait for receipt and decode JobCreated event
    const client = this.getPublicClient(chain.chainId);
    const receipt = await client.waitForTransactionReceipt({ hash });

    const logs = parseEventLogs({
      abi: monadEscrowAbi,
      logs: receipt.logs,
      eventName: "JobCreated",
    });

    if (logs.length === 0 || logs[0].args.jobId === undefined) {
      throw new CommandError(
        "RECEIPT_PARSING_FAILED",
        `Transaction ${hash} confirmed, but JobCreated event was not found in receipt logs.`,
        "Check escrow contract address and receipt on Monad Explorer."
      );
    }

    const onChainJobId = logs[0].args.jobId.toString();

    io.emit(`Job escrow funded on ${chain.name}! JobId: ${onChainJobId}, TxHash: ${hash}`);
    io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

    return {
      jobId: onChainJobId,
      workerAddress,
      bountyMon,
      taskDescription,
      escrowTransactionHash: hash,
      chainId: chain.chainId,
    };
  }
}
