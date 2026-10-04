import { parseEther } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  monadPaymentInputSchema,
} from "@zakyirsyaad/monagent-shared";

import { PluginCommand, type CommandIO } from "../sdk.js";

export interface MonadPaymentResult {
  transactionHash: `0x${string}`;
  to: string;
  amount: string;
  token: string;
  memo?: string;
}

export class MonadPayCommand extends PluginCommand<MonadPaymentResult> {
  static override description = "Send direct MON or ERC-20 payment on Monad Testnet";
  protected override readonly pluginCommandId = "monad:pay";

  async execute(io: CommandIO): Promise<MonadPaymentResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadPaymentInputSchema);
    const { to, amount, token, memo } = monadPaymentInputSchema.parse(rawInputs);

    if (token !== "MON") {
      throw new Error(`Token ${token} not yet supported directly in quick-pay. Use MON for native transfers.`);
    }

    const valueInWei = parseEther(amount);

    const executor = this.ctx.walletExecutor(io, this.pluginCommandId);
    const result = await executor({
      kind: "transaction",
      chainId: MONAD_TESTNET_CHAIN_ID,
      to,
      value: valueInWei,
    });

    if (result.status !== "success" || !result.hash) {
      throw new Error(`Failed to send MON payment: status ${result.status}`);
    }

    io.log(`Paid ${amount} MON to ${to}. TxHash: ${result.hash}`);

    return {
      transactionHash: result.hash,
      to,
      amount,
      token,
      memo,
    };
  }
}
