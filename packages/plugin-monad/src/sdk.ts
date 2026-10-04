import {
  PluginCommand,
  type CommandIO,
  type PluginCommandContext,
  CommandError,
  InputFieldType,
  type InputSchema,
} from "@metamask/agent-wallet/plugin";
import { createPublicClient, http, type PublicClient } from "viem";
import { MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_RPC_URL, MONAD_MAINNET_CHAIN_ID, MONAD_MAINNET_RPC_URL } from "./monad.js";

export abstract class BaseMonadPluginCommand<TFinal = void> extends PluginCommand<TFinal> {
  static description: string;
  static requiresAuth = false;
  static requiresInit = false;
  public declare ctx: PluginCommandContext;
  protected abstract readonly pluginCommandId: string;

  public setContext(ctx: PluginCommandContext): void {
    this.ctx = ctx;
  }

  /**
   * Get an EVM PublicClient for reads, preferring the host's publicClient if available and working,
   * with fallback to canonical Monad RPC when running in test environments or when host gateway fails.
   */
  public getPublicClient(chainId: number = MONAD_TESTNET_CHAIN_ID): PublicClient {
    const rpcUrl = chainId === MONAD_MAINNET_CHAIN_ID ? MONAD_MAINNET_RPC_URL : MONAD_TESTNET_RPC_URL;
    const directClient = createPublicClient({
      transport: http(rpcUrl),
    }) as unknown as PublicClient;

    if (this.ctx && typeof this.ctx.publicClient === "function") {
      try {
        const hostClient = this.ctx.publicClient(chainId);
        // Wrap hostClient with fallback to directClient on RPC transport errors (such as 400 Invalid chainId from Infura proxy)
        return new Proxy(hostClient, {
          get(target, prop, receiver) {
            const orig = Reflect.get(target, prop, receiver);
            if (typeof orig === "function") {
              return async (...args: any[]) => {
                try {
                  return await orig.apply(target, args);
                } catch (err) {
                  // If host publicClient method fails (e.g. Infura proxy invalid chainId), fallback to direct Monad RPC
                  const fallbackFn = Reflect.get(directClient, prop, directClient);
                  if (typeof fallbackFn === "function") {
                    return await fallbackFn.apply(directClient, args);
                  }
                  throw err;
                }
              };
            }
            return orig;
          },
        });
      } catch {
        // Host resolution threw synchronously
      }
    }

    return directClient;
  }
}

export {
  type CommandIO,
  type PluginCommandContext,
  CommandError,
  InputFieldType,
  type InputSchema,
  type PublicClient,
};

/**
 * EVM Transaction payload expected by MetaMask EvmWalletExecutor
 */
export interface EvmTxParams {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
}

export interface EvmExecutorTransactionRequest {
  kind: "transaction";
  chainId: number;
  transaction: EvmTxParams;
}

export interface EvmExecutorTypedDataRequest {
  kind: "typed-data";
  chainId: number;
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}

export interface EvmExecutorMessageRequest {
  kind: "message";
  chainId: number;
  message: string;
}

export type EvmExecutorRequest =
  | EvmExecutorTransactionRequest
  | EvmExecutorTypedDataRequest
  | EvmExecutorMessageRequest;

export interface EvmExecutorResult {
  kind?: string;
  hash?: `0x${string}`;
  signature?: `0x${string}`;
  status: "CONFIRMED" | "SUBMITTED" | "FAILED" | "REJECTED" | string;
  failureDescription?: string;
  pendingJob?: {
    pollingId?: string;
  };
}

/**
 * Helper function to execute transactions through MetaMask EvmWalletExecutor
 */
export async function executeTransaction(
  ctx: PluginCommandContext,
  io: CommandIO,
  source: string,
  params: {
    chainId: number;
    to: `0x${string}`;
    value?: bigint;
    data?: `0x${string}`;
  }
): Promise<`0x${string}`> {
  const executor = await ctx.walletExecutor(io, source);
  const res = (await (executor as any)(
    {
      kind: "transaction",
      chainId: params.chainId,
      transaction: {
        to: params.to,
        value: params.value,
        data: params.data,
      },
    },
    { signal: (io as any).signal }
  )) as EvmExecutorResult;

  if ((res.status !== "CONFIRMED" && res.status !== "SUBMITTED") || !res.hash) {
    throw new CommandError(
      "TRANSACTION_FAILED",
      `Transaction failed on Monad: ${res.failureDescription || res.status}`,
      "Check wallet balance and RPC connectivity, then retry."
    );
  }

  return res.hash;
}

/**
 * Helper function to sign typed data (EIP-712) through MetaMask EvmWalletExecutor
 */
export async function executeSignTypedData(
  ctx: PluginCommandContext,
  io: CommandIO,
  source: string,
  params: {
    chainId: number;
    typedData: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    };
  }
): Promise<`0x${string}`> {
  const executor = await ctx.walletExecutor(io, source);
  const res = (await (executor as any)(
    {
      kind: "typed-data",
      chainId: params.chainId,
      typedData: params.typedData,
    },
    { signal: (io as any).signal }
  )) as EvmExecutorResult;

  if (res.status !== "CONFIRMED" || !res.signature) {
    throw new CommandError(
      "SIGNING_FAILED",
      `EIP-712 signing failed: ${res.failureDescription || res.status}`,
      "Ensure wallet is unlocked and approved."
    );
  }

  return res.signature;
}
