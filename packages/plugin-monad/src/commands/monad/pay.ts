import { parseEther } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  monadPaymentInputSchema,
} from "../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
  executeTransaction,
} from "../../sdk.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface MonadPaymentResult {
  transactionHash: `0x${string}`;
  to: string;
  amount: string;
  token: string;
  memo?: string;
}

export class MonadPayCommand extends BaseMonadPluginCommand<MonadPaymentResult> {
  static description = "Send direct MON or ERC-20 payment on Monad Testnet";
  protected override readonly pluginCommandId = "monad:pay";

  public static readonly inputs: InputSchema = {
    to: {
      type: InputFieldType.Text,
      flag: "to",
      message: "Recipient EVM address on Monad",
      required: true,
    },
    amount: {
      type: InputFieldType.Text,
      flag: "amount",
      message: "Amount to transfer (e.g. 0.5)",
      required: true,
    },
    token: {
      type: InputFieldType.Text,
      flag: "token",
      message: "Token symbol (default MON)",
      required: false,
    },
    memo: {
      type: InputFieldType.Text,
      flag: "memo",
      message: "Payment memo or reason",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<MonadPaymentResult> {
    const rawInputs = await io.resolveInputs(MonadPayCommand.inputs);
    const parsed = monadPaymentInputSchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid payment input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide a valid recipient address and positive amount."
      );
    }
    const { to, amount, token, memo } = parsed.data;

    if (token !== "MON") {
      throw new CommandError(
        "UNSUPPORTED_TOKEN",
        `Token ${token} not yet supported directly in quick-pay. Use MON for native transfers.`,
        "Specify --token MON or omit the token flag."
      );
    }

    const valueInWei = parseEther(amount);

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: to as `0x${string}`,
      value: valueInWei,
    });

    io.emit(`Paid ${amount} MON to ${to}. TxHash: ${hash}`);

    return {
      transactionHash: hash,
      to,
      amount,
      token,
      memo,
    };
  }
}
