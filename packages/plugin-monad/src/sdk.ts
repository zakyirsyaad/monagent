import type { PublicClient } from "viem";

/**
 * Standard CommandIO interface conforming to @metamask/agent-wallet/plugin
 */
export interface CommandIO {
  resolveInputs<T>(schema: unknown): Promise<T>;
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
}

export type WalletExecutorRequest =
  | { kind: "transaction"; chainId: number; to: string; value?: bigint; data?: `0x${string}` }
  | { kind: "message"; message: string }
  | { kind: "typed-data"; domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };

export interface WalletExecutorResult {
  hash?: `0x${string}`;
  signature?: `0x${string}`;
  status: "success" | "pending" | "rejected";
}

export interface PluginCommandContext {
  publicClient(chainId: number): PublicClient;
  walletExecutor(io: CommandIO, commandId: string): (req: WalletExecutorRequest) => Promise<WalletExecutorResult>;
  logger: {
    info(msg: string): void;
    error(msg: string): void;
    warn(msg: string): void;
  };
}

/**
 * Base PluginCommand class simulating the sealed host lifecycle of MetaMask Agent Wallet
 */
export abstract class PluginCommand<TResult = unknown> {
  static description: string = "";
  static requiresAuth: boolean = true;
  static requiresInit: boolean = true;

  protected abstract readonly pluginCommandId: string;
  protected ctx!: PluginCommandContext;

  public setContext(ctx: PluginCommandContext): void {
    this.ctx = ctx;
  }

  abstract execute(io: CommandIO): Promise<TResult>;
}
