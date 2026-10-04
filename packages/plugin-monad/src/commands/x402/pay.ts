import { parseEther } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  monadX402PaymentSchema,
} from "@zakyirsyaad/monagent-shared";

import { PluginCommand, type CommandIO } from "../../sdk.js";

export interface X402PayResult {
  url: string;
  statusCode: number;
  response: string;
  paymentSettled: boolean;
  paymentTransactionHash?: `0x${string}`;
}

export class MonadX402PayCommand extends PluginCommand<X402PayResult> {
  static override description = "Execute paid tool/API call over HTTP 402 with Monad micropayments";
  protected override readonly pluginCommandId = "monad:x402:pay";

  async execute(io: CommandIO): Promise<X402PayResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadX402PaymentSchema);
    const { url, method, body, maxSpendMon } = monadX402PaymentSchema.parse(rawInputs);

    io.log(`Executing request to paid API: ${url}`);

    // Initial probe to check if 402 Payment Required is returned
    const initialRes = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: method === "POST" ? body : undefined,
    }).catch(() => null);

    if (initialRes && initialRes.status !== 402) {
      const text = await initialRes.text();
      return {
        url,
        statusCode: initialRes.status,
        response: text,
        paymentSettled: false,
      };
    }

    // Parse x402 payment requirements from headers or body
    const recipient = initialRes?.headers.get("x-payment-recipient") || "0x1111111111111111111111111111111111111111";
    const paymentAmount = initialRes?.headers.get("x-payment-amount") || "0.01";

    if (Number(paymentAmount) > Number(maxSpendMon)) {
      throw new Error(`Requested payment ${paymentAmount} MON exceeds maximum spend limit of ${maxSpendMon} MON`);
    }

    io.log(`Server requested 402 Payment: ${paymentAmount} MON to ${recipient}. Executing on Monad...`);

    const executor = this.ctx.walletExecutor(io, this.pluginCommandId);
    const tx = await executor({
      kind: "transaction",
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: recipient,
      value: parseEther(paymentAmount),
    });

    if (tx.status !== "success" || !tx.hash) {
      throw new Error(`402 payment settlement failed on Monad: ${tx.status}`);
    }

    io.log(`Payment confirmed: ${tx.hash}. Retrying paid API request with payment proof...`);

    // Retry with Monad transaction proof
    const paidRes = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Payment-Tx": tx.hash,
        "X-Payment-Chain": String(MONAD_TESTNET_CHAIN_ID),
      },
      body: method === "POST" ? body : undefined,
    });

    const responseText = await paidRes.text();

    return {
      url,
      statusCode: paidRes.status,
      response: responseText,
      paymentSettled: true,
      paymentTransactionHash: tx.hash,
    };
  }
}
