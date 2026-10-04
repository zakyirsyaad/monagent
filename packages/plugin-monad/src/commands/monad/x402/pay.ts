import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { recoverTypedDataAddress } from "viem";
import {
  resolveChain,
  MONAD_TESTNET_CAIP2,
  MONAD_MAINNET_CAIP2,
  MONAD_TESTNET_USDC,
  MONAD_MAINNET_USDC,
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
      aliases: ["max-spend"],
      message: "Maximum spend limit in token base units (e.g. 1000000 for 1 USDC)",
      required: false,
    },
    payer: {
      type: InputFieldType.Text,
      flag: "payer",
      message: "Payer EVM wallet address to sign payment authorization",
      required: true,
    },
    chainId: {
      type: InputFieldType.Text,
      flag: "chain-id",
      aliases: ["chainId"],
      message: "Monad chain ID (10143 for testnet, 143 for mainnet)",
      default: "10143",
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
    const rawPayer = String(rawInputs.payer || "").trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(rawPayer) || rawPayer.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid or missing --payer address "${rawPayer}". A non-zero EVM address is required.`,
        "Provide your agent wallet address using --payer 0x..."
      );
    }
    const payerAddress = rawPayer as `0x${string}`;

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

    // Derive chain ID from CAIP-2 requirement.network regex
    const caipMatch = /^eip155:(\d+)$/.exec(requirement.network);
    if (!caipMatch) {
      throw new CommandError(
        "UNSUPPORTED_PAYMENT_NETWORK",
        `Network "${requirement.network}" does not conform to CAIP-2 eip155:<chainId>.`,
        "Ensure the server provides a valid eip155 CAIP-2 network."
      );
    }
    const resolvedChain = resolveChain(Number(caipMatch[1]));

    // Enrich extra domain info if server didn't include it for USDC
    const isUsdc =
      requirement.asset?.toLowerCase() === MONAD_TESTNET_USDC.toLowerCase() ||
      requirement.asset?.toLowerCase() === MONAD_MAINNET_USDC.toLowerCase();

    if (isUsdc && !requirement.extra) {
      requirement.extra = {
        name: "USDC",
        version: "2",
      };
    }
    if (!requirement.maxTimeoutSeconds) {
      requirement.maxTimeoutSeconds = 3600;
    }

    io.emit(
      `Negotiating x402 payment: ${requirement.amount} (${requirement.asset}) on ${resolvedChain.name} (${requirement.network}) to ${requirement.payTo}...`
    );

    // createPaymentPayload must sign EXACTLY the inspected requirement
    const sanitizedPaymentRequired = {
      ...paymentRequired,
      accepts: [requirement],
    };

    // Build ClientEvmSigner backed by MetaMask walletExecutor
    let lastTypedData: any = null;
    let lastSignature: `0x${string}` | null = null;

    const evmSigner = {
      address: payerAddress,
      signTypedData: async (typedDataMsg: any) => {
        lastTypedData = typedDataMsg;
        const sig = await executeSignTypedData(this.ctx, io, this.pluginCommandId, {
          chainId: resolvedChain.chainId,
          typedData: {
            domain: typedDataMsg.domain,
            types: typedDataMsg.types,
            primaryType: typedDataMsg.primaryType,
            message: typedDataMsg.message,
          },
        });
        lastSignature = sig;
        return sig;
      },
    };

    registerExactEvmScheme(client, { signer: evmSigner, networks: [requirement.network] });

    let paymentPayload: any;
    try {
      paymentPayload = await httpClient.createPaymentPayload(sanitizedPaymentRequired);
    } catch (err: any) {
      throw new CommandError(
        "PAYMENT_PAYLOAD_FAILED",
        `Failed to generate x402 payment authorization: ${err?.message || String(err)}`,
        "Ensure wallet is unlocked and approved to sign EIP-712 payment authorization."
      );
    }

    // Verify signer matches payerAddress using recoverTypedDataAddress. Abort on ANY error.
    if (lastTypedData && lastSignature) {
      try {
        const recovered = await recoverTypedDataAddress({
          domain: lastTypedData.domain,
          types: lastTypedData.types,
          primaryType: lastTypedData.primaryType,
          message: lastTypedData.message,
          signature: lastSignature,
        });

        if (recovered.toLowerCase() !== payerAddress.toLowerCase()) {
          throw new CommandError(
            "PAYER_MISMATCH",
            `Recovered signature address ${recovered} does not match specified --payer ${payerAddress}.`,
            "Ensure the active wallet in MetaMask matches --payer."
          );
        }
      } catch (err: any) {
        if (err instanceof CommandError) throw err;
        throw new CommandError(
          "SIGNATURE_VERIFICATION_FAILED",
          `Failed to verify EIP-712 payment signature: ${err?.message || String(err)}`,
          "Verify that the wallet produced a valid EIP-712 signature."
        );
      }
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
