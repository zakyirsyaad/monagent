import { parseEther } from "viem";
import {
  MONAD_TESTNET_CHAIN_ID,
  monadX402PaymentSchema,
} from "@zakyirsyaad/monagent-shared";

import { BaseMonadPluginCommand, type CommandIO, CommandError, executeTransaction } from "../../../sdk.js";

export interface X402PayResult {
  url: string;
  statusCode: number;
  response: string;
  paymentSettled: boolean;
  paymentTransactionHash?: `0x${string}`;
}

export class MonadX402PayCommand extends BaseMonadPluginCommand<X402PayResult> {
  static override description = "Execute paid tool/API call over HTTP 402 with Monad micropayments";
  protected override readonly pluginCommandId = "monad:x402:pay";

  async execute(io: CommandIO): Promise<X402PayResult> {
    const rawInputs = await io.resolveInputs<unknown>(monadX402PaymentSchema);
    const { url, method, body, maxSpendMon } = monadX402PaymentSchema.parse(rawInputs);

    io.log(`Executing request to paid API: ${url}`);

    // Initial probe to check if 402 Payment Required is returned
    let initialRes: Response;
    try {
      initialRes = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: method === "POST" ? body : undefined,
      });
    } catch (err: any) {
      throw new CommandError(
        "FETCH_FAILED",
        `Failed to reach target URL: ${err?.message || String(err)}`,
        "Verify the endpoint URL and network connectivity."
      );
    }

    if (initialRes.status !== 402) {
      const text = await initialRes.text();
      return {
        url,
        statusCode: initialRes.status,
        response: text,
        paymentSettled: false,
      };
    }

    // Parse x402 payment requirements from headers or JSON body
    let recipient: string | null = null;
    let paymentAmount: string | null = null;

    // Check standard headers or parse body
    const headerRecipient = initialRes.headers.get("x-payment-recipient") || initialRes.headers.get("payee");
    const headerAmount = initialRes.headers.get("x-payment-amount") || initialRes.headers.get("amount");

    if (headerRecipient && headerAmount) {
      recipient = headerRecipient;
      paymentAmount = headerAmount;
    } else {
      try {
        const cloned = initialRes.clone();
        const json = await cloned.json();
        recipient = json.recipient || json.payee || json.address || json.accepts?.[0]?.payee || null;
        paymentAmount = json.amount || json.price || json.accepts?.[0]?.amount || null;
      } catch {
        // not json
      }
    }

    if (!recipient || !paymentAmount) {
      throw new CommandError(
        "INVALID_402_RESPONSE",
        "Server returned HTTP 402 Payment Required but did not provide valid payment requirements (recipient and amount).",
        "Ensure the server implements x402 payment headers or body format."
      );
    }

    if (Number(paymentAmount) > Number(maxSpendMon)) {
      throw new CommandError(
        "MAX_SPEND_EXCEEDED",
        `Requested payment ${paymentAmount} MON exceeds maximum spend limit of ${maxSpendMon} MON`,
        "Increase maxSpendMon if you wish to allow higher payment."
      );
    }

    io.log(`Server requested 402 Payment: ${paymentAmount} MON to ${recipient}. Executing on Monad...`);

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: MONAD_TESTNET_CHAIN_ID,
      to: recipient as `0x${string}`,
      value: parseEther(paymentAmount),
    });
    io.log(`Payment confirmed on Monad: ${hash}. Retrying paid API request with payment proof...`);

    // Retry with Monad transaction proof
    const paidRes = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Authorization": `x402-tx ${hash}`,
        "X-Payment-Tx": hash,
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
      paymentTransactionHash: hash,
    };
  }
}
