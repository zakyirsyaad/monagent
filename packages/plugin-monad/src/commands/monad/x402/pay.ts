import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { isAddress, recoverTypedDataAddress } from "viem";
import {
  resolveChain,
  monadX402PaySchema,
} from "../../../monad.js";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
  executeSignTypedData,
} from "../../../sdk.js";
import { safeFetch } from "../../../ssrf.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface X402PayResult {
  url: string;
  statusCode: number;
  httpOk: boolean;
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
      prompt: false,
    },
    body: {
      type: InputFieldType.Text,
      flag: "body",
      message: "HTTP request JSON body for POST requests",
      required: false,
      prompt: false,
    },
    maxSpend: {
      type: InputFieldType.Text,
      flag: "maxSpend",
      aliases: ["max-spend"],
      message: "Maximum spend limit in token base units (e.g. 1000000 for 1 USDC)",
      required: false,
      prompt: false,
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
      required: false,
      prompt: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<X402PayResult> {
    const rawInputs = await io.resolveInputs(MonadX402PayCommand.inputs);

    const parsed = monadX402PaySchema.safeParse(rawInputs);
    if (!parsed.success) {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid x402 payment input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        "Provide a valid HTTPS URL, valid non-zero payer address, and numeric maxSpend."
      );
    }

    const { url, method, body, maxSpend: maxSpendStr, payer: rawPayer } = parsed.data;
    const maxSpend = BigInt(maxSpendStr);
    const payerAddress = rawPayer as `0x${string}`;

    io.emit(`Executing request to paid API: ${url}...`);

    const lookupFn = (this.ctx as any)?.dnsLookup;

    const initialRes = await safeFetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" && body ? body : undefined,
      lookup: lookupFn,
    });

    if (initialRes.status !== 402) {
      const text = await initialRes.text();
      const MAX_BODY_LEN = 8192;
      const capped = text.length > MAX_BODY_LEN ? text.slice(0, MAX_BODY_LEN) + "... [truncated]" : text;
      return {
        url,
        statusCode: initialRes.status,
        httpOk: initialRes.status >= 200 && initialRes.status < 300,
        response: capped,
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

    // Resolve target chain from user input (defaults to 10143)
    const targetChain = resolveChain(rawInputs.chainId as any);

    // Inspect accepted payment requirements matching targetChain.caip2
    const accepts = paymentRequired.accepts || [];

    const requirement = accepts.find((req: any) =>
      req.scheme === "exact" && req.network === targetChain.caip2
    );

    if (!requirement) {
      throw new CommandError(
        "UNSUPPORTED_PAYMENT_NETWORK",
        `No compatible exact EVM payment requirement found for ${targetChain.name} (${targetChain.caip2}). Server accepts: ${JSON.stringify(accepts)}`,
        `Ensure the server supports ${targetChain.name} (${targetChain.caip2}).`
      );
    }

    // Asset Binding: Reject unless requirement.asset equals targetChain.usdc
    if (!requirement.asset || requirement.asset.toLowerCase() !== targetChain.usdc.toLowerCase()) {
      throw new CommandError(
        "UNSUPPORTED_TOKEN",
        `Payment requirement asset "${requirement.asset}" does not match canonical USDC on ${targetChain.name} (${targetChain.usdc}).`,
        `Only canonical USDC is supported for x402 payments on ${targetChain.name}.`
      );
    }

    // Validate payTo recipient address
    if (!requirement.payTo || !isAddress(requirement.payTo) || requirement.payTo.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      throw new CommandError(
        "INVALID_INPUT",
        `Invalid payTo address in payment requirement: "${requirement.payTo}".`,
        "Ensure payment requirement specifies a valid non-zero EVM address."
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

    const resolvedChain = targetChain;

    if (!requirement.extra) {
      requirement.extra = {
        name: "USDC",
        version: "2",
      };
    }

    // Cap maxTimeoutSeconds to 300 seconds (5 minutes)
    const requestedTimeout = Number(requirement.maxTimeoutSeconds);
    requirement.maxTimeoutSeconds = Math.min(
      Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 300,
      300
    );

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

    // Fail-closed verification: lastTypedData and lastSignature MUST be present
    if (!lastTypedData || !lastSignature) {
      throw new CommandError(
        "SIGNATURE_VERIFICATION_FAILED",
        "x402 payment client failed to produce EIP-712 typed data or signature.",
        "Ensure wallet is unlocked and approved to sign EIP-712 payment authorization."
      );
    }

    // Assert that the signed typed-data matches the validated requirement exactly
    const signedChainId = Number(lastTypedData.domain?.chainId);
    if (signedChainId !== resolvedChain.chainId) {
      throw new CommandError(
        "SIGNATURE_VERIFICATION_FAILED",
        `Signed authorization chainId (${signedChainId}) does not match target chainId (${resolvedChain.chainId}).`,
        "Ensure payment authorization signs for the target network."
      );
    }

    const signedVerifyingContract = String(lastTypedData.domain?.verifyingContract || "").toLowerCase();
    if (signedVerifyingContract !== resolvedChain.usdc.toLowerCase()) {
      throw new CommandError(
        "SIGNATURE_VERIFICATION_FAILED",
        `Signed verifyingContract (${signedVerifyingContract}) does not match canonical USDC (${resolvedChain.usdc.toLowerCase()}).`,
        "Ensure payment authorization is bound to canonical USDC."
      );
    }

    const signedValue =
      lastTypedData.message?.value !== undefined
        ? BigInt(lastTypedData.message.value)
        : (lastTypedData.message?.amount !== undefined ? BigInt(lastTypedData.message.amount) : null);
    if (signedValue === null || signedValue !== requestedAmount) {
      throw new CommandError(
        "SIGNATURE_VERIFICATION_FAILED",
        `Signed authorization amount (${signedValue}) does not match requirement amount (${requestedAmount}).`,
        "Ensure payment authorization signs the exact requested amount."
      );
    }

    const signedRecipient = String(
      lastTypedData.message?.to || lastTypedData.message?.payTo || lastTypedData.message?.recipient || ""
    ).toLowerCase();
    if (signedRecipient !== requirement.payTo.toLowerCase()) {
      throw new CommandError(
        "SIGNATURE_VERIFICATION_FAILED",
        `Signed authorization recipient (${signedRecipient}) does not match requirement payTo (${requirement.payTo.toLowerCase()}).`,
        "Ensure payment authorization signs the exact recipient."
      );
    }

    // Verify signer matches payerAddress using recoverTypedDataAddress.
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

    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    io.emit("x402 Payment authorization signed. Re-submitting request with payment proof...");

    const paidRes = await safeFetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...paymentHeaders,
      },
      body: method === "POST" && body ? body : undefined,
      lookup: lookupFn,
    });

    const rawResponseText = await paidRes.text();
    const MAX_RESPONSE_LEN = 8192;
    const responseText =
      rawResponseText.length > MAX_RESPONSE_LEN
        ? rawResponseText.slice(0, MAX_RESPONSE_LEN) + "... [truncated]"
        : rawResponseText;

    const paymentResponseHeader =
      paidRes.headers.get("PAYMENT-RESPONSE") ||
      paidRes.headers.get("payment-response") ||
      paidRes.headers.get("X-PAYMENT-RESPONSE") ||
      paidRes.headers.get("x-payment-response");

    const httpOk = paidRes.status >= 200 && paidRes.status < 300;
    const paymentSettled = httpOk && Boolean(paymentResponseHeader);

    return {
      url,
      statusCode: paidRes.status,
      httpOk,
      response: responseText,
      paymentSettled,
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
