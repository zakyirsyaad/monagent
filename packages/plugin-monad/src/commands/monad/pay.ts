import { parseEther } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  monadPaymentInputSchema,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, executeTransaction } from "../../sdk.js";

export interface MonadPaymentResult {
  transactionHash: `0x${string}`;
  to: string;
  amount: string;
  token: string;
  memo?: string;
}

export class MonadPayCommand extends BaseMonadPluginCommand<MonadPaymentResult> {
  static override description = "Send direct MON or ERC-20 payment on Monad Testnet";
  protected override readonly pluginCommandId = "monad:pay";

  async execute(io: CommandIO): Promise<MonadPaymentResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadPaymentInputSchema);
    const { to, amount, token, memo } = monadPaymentInputSchema.parse(rawInputs);

    if (token !== "MON") {
      throw new Error(`Token ${token} not yet supported directly in quick-pay. Use MON for native transfers.`);
    }

    const valueInWei = parseEther(amount);

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: to as `0x${string}`,
      value: valueInWei,
    });

    io.log(`Paid ${amount} MON to ${to}. TxHash: ${hash}`);

    return {
      transactionHash: hash,
      to,
      amount,
      token,
      memo,
    };
  }
}
