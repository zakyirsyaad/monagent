import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CAIP2,
  MONAD_MAINNET_CAIP2,
  MONAD_TESTNET_USDC,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
  executeSignTypedData,
} from "../../../sdk.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface X402PayResult {
  url: string;
  statusCode: number;
  response: string;
  paymentSettled: boolean;
  paymentDetails?: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
  };
}

export class MonadX402PayCommand extends BaseMonadPluginCommand<X402PayResult> {
  static description = "Execute paid tool/API call over HTTP 402 with real x402 EVM micropayments";
  protected override readonly pluginCommandId = "monad:x402:pay";

  public static readonly inputs: InputSchema = {
    url: {
      type: InputFieldType.Text,
      flag: "url",
      message: "Target HTTP 402 paid endpoint URL",
      required: true,
    },
    method: {
      type: InputFieldType.Text,
      flag: "method",
      message: "HTTP method (GET or POST)",
      default: "GET",
      required: false,
    },
    body: {
      type: InputFieldType.Text,
      flag: "body",
      message: "HTTP request JSON body for POST requests",
      required: false,
    },
    maxSpend: {
      type: InputFieldType.Text,
      flag: "maxSpend",
      message: "Maximum spend limit in token base units (e.g. 1000000 for 1 USDC)",
      default: "1000000",
      required: false,
    },
    payer: {
      type: InputFieldType.Text,
      flag: "payer",
      message: "Explicit payer EVM address (if not inferred)",
      required: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<X402PayResult> {
    const rawInputs = await io.resolveInputs(MonadX402PayCommand.inputs);
    const url = String(rawInputs.url).trim();
    const method = (rawInputs.method || "GET").toUpperCase();
    const body = rawInputs.body;
    const maxSpend = BigInt(rawInputs.maxSpend || "1000000");
    const payerAddress = (rawInputs.payer || "0x0000000000000000000000000000000000000000") as `0x${string}`;

    io.emit(`Executing request to paid API: ${url}...`);

    let initialRes: Response;
    try {
      initialRes = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "POST" && body ? body : undefined,
      });
    } catch (err: any) {
      throw new CommandError(
        "FETCH_FAILED",
        `Failed to reach target URL: ${err?.message || String(err)}`,
        "Verify endpoint URL and network connectivity."
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

    // Server returned 402 Payment Required. Parse x402 headers or JSON body.
    const client = new x402Client();
    const httpClient = new x402HTTPClient(client);

    let paymentRequired: any;
    try {
      const headerVal =
        initialRes.headers.get("PAYMENT-REQUIRED") ||
        initialRes.headers.get("payment-required");
      const jsonBody = await initialRes.clone().json().catch(() => null);

      if (headerVal) {
        paymentRequired = httpClient.getPaymentRequiredResponse(
          (name: string) => initialRes.headers.get(name),
          jsonBody
        );
      } else if (jsonBody && typeof jsonBody === "object") {
        if (jsonBody.x402Version === 1) {
          paymentRequired = jsonBody;
        } else if (jsonBody.x402Version === 2 || jsonBody.accepts) {
          paymentRequired = {
            x402Version: jsonBody.x402Version || 2,
            accepts: jsonBody.accepts || [],
          };
        } else {
          throw new Error("Missing x402 accepts field in JSON body");
        }
      } else {
        throw new Error("No PAYMENT-REQUIRED header or JSON body present");
      }
    } catch (err: any) {
      throw new CommandError(
        "INVALID_402_RESPONSE",
        `Server returned HTTP 402 but x402 Payment-Required headers/body could not be parsed: ${err?.message || String(err)}`,
        "Ensure the server implements the x402 protocol specification."
      );
    }

    // Inspect accepted payment requirements
    const accepts = paymentRequired.accepts || [];
    const supportedNetworks = [MONAD_TESTNET_CAIP2, MONAD_MAINNET_CAIP2, "eip155:10143", "eip155:143"];

    const requirement = accepts.find((req: any) =>
      req.scheme === "exact" && supportedNetworks.includes(req.network)
    );

    if (!requirement) {
      throw new CommandError(
        "UNSUPPORTED_PAYMENT_NETWORK",
        `No compatible Monad exact EVM payment requirement found. Server accepts: ${JSON.stringify(accepts)}`,
        "Ensure the server supports Monad testnet (eip155:10143) or mainnet (eip155:143)."
      );
    }

    const requestedAmount = BigInt(requirement.amount);
    if (requestedAmount > maxSpend) {
      throw new CommandError(
        "MAX_SPEND_EXCEEDED",
        `Requested payment ${requestedAmount} exceeds maximum configured spend limit ${maxSpend}.`,
        "Increase --maxSpend if you wish to allow higher payment."
      );
    }

    // Enrich extra domain info if server didn't include it for testnet USDC
    if (requirement.asset?.toLowerCase() === MONAD_TESTNET_USDC.toLowerCase() && !requirement.extra) {
      requirement.extra = {
        name: "USDC",
        version: "2",
      };
    }
    if (!requirement.maxTimeoutSeconds) {
      requirement.maxTimeoutSeconds = 3600;
    }

    io.emit(
      `Negotiating x402 payment: ${requirement.amount} (${requirement.asset}) on ${requirement.network} to ${requirement.payTo}...`
    );

    // Build ClientEvmSigner backed by MetaMask walletExecutor
    const evmSigner = {
      address: payerAddress,
      signTypedData: async (typedDataMsg: any) => {
        const chainId = requirement.network.includes("10143")
          ? MONAD_TESTNET_CHAIN_ID
          : MONAD_MAINNET_CHAIN_ID;

        return await executeSignTypedData(this.ctx, io, this.pluginCommandId, {
          chainId,
          typedData: {
            domain: typedDataMsg.domain,
            types: typedDataMsg.types,
            primaryType: typedDataMsg.primaryType,
            message: typedDataMsg.message,
          },
        });
      },
    };

    registerExactEvmScheme(client, { signer: evmSigner });

    let paymentPayload: any;
    try {
      paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    } catch (err: any) {
      throw new CommandError(
        "PAYMENT_PAYLOAD_FAILED",
        `Failed to generate x402 payment authorization: ${err?.message || String(err)}`,
        "Ensure wallet is unlocked and approved to sign EIP-712 payment authorization."
      );
    }

    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    io.emit("x402 Payment authorization signed. Re-submitting request with payment proof...");

    const paidRes = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...paymentHeaders,
      },
      body: method === "POST" && body ? body : undefined,
    });

    const responseText = await paidRes.text();

    return {
      url,
      statusCode: paidRes.status,
      response: responseText,
      paymentSettled: paidRes.status >= 200 && paidRes.status < 300,
      paymentDetails: {
        scheme: requirement.scheme,
        network: requirement.network,
        asset: requirement.asset,
        amount: requirement.amount,
        payTo: requirement.payTo,
      },
    };
  }
}
