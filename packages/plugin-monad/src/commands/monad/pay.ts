import { encodeFunctionData, erc20Abi, isAddress, parseEther, parseUnits } from "viem";
import {
  resolveChain,
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
  chainId: number;
}

export class MonadPayCommand extends BaseMonadPluginCommand<MonadPaymentResult> {
  static description = "Send direct MON or ERC-20 payment on Monad";
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
      message: "Token symbol (MON, USDC, or 0x<address>)",
      default: "MON",
      required: false,
    },
    memo: {
      type: InputFieldType.Text,
      flag: "memo",
      message: "Payment memo or reason",
      required: false,
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
    const chain = resolveChain(rawInputs.chainId as any);

    const tokenUpper = token.trim().toUpperCase();
    let targetAddress: `0x${string}`;
    let txValue = 0n;
    let txData: `0x${string}` | undefined = undefined;

    if (tokenUpper === "MON") {
      targetAddress = to as `0x${string}`;
      txValue = parseEther(amount);
      if (txValue <= 0n) {
        throw new CommandError(
          "INVALID_AMOUNT",
          "Amount must be strictly greater than zero.",
          "Provide an amount > 0."
        );
      }
    } else if (tokenUpper === "USDC") {
      targetAddress = chain.usdc;
      const parsedAmount = parseUnits(amount, 6);
      if (parsedAmount <= 0n) {
        throw new CommandError(
          "INVALID_AMOUNT",
          "Amount must be strictly greater than zero.",
          "Provide an amount > 0."
        );
      }
      txData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, parsedAmount],
      });
    } else if (/^0x[a-fA-F0-9]{40}$/.test(token.trim())) {
      const customTokenAddress = token.trim() as `0x${string}`;
      const client = this.getPublicClient(chain.chainId);

      const code = await client.getCode({ address: customTokenAddress });
      if (!code || code === "0x") {
        throw new CommandError(
          "INVALID_TOKEN_CONTRACT",
          `No contract bytecode found at token address ${customTokenAddress} on chain ${chain.chainId}.`,
          "Provide a valid deployed ERC-20 token contract address."
        );
      }

      let decimals = 18;
      try {
        decimals = (await client.readContract({
          address: customTokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        })) as number;
      } catch (err: any) {
        throw new CommandError(
          "INVALID_TOKEN_CONTRACT",
          `Failed to read decimals from token contract ${customTokenAddress}: ${err?.message || String(err)}`,
          "Ensure the target address implements the ERC-20 standard."
        );
      }

      const parsedAmount = parseUnits(amount, decimals);
      if (parsedAmount <= 0n) {
        throw new CommandError(
          "INVALID_AMOUNT",
          "Amount must be strictly greater than zero.",
          "Provide an amount > 0."
        );
      }

      targetAddress = customTokenAddress;
      txData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, parsedAmount],
      });
    } else {
      throw new CommandError(
        "UNSUPPORTED_TOKEN",
        `Token "${token}" is not supported. Supported tokens are MON, USDC, or a contract address (0x...).`,
        "Specify --token MON, --token USDC, or --token 0x<address>."
      );
    }

    const hash = await executeTransaction(this.ctx, io, this.pluginCommandId, {
      chainId: chain.chainId,
      to: targetAddress,
      value: txValue,
      data: txData,
    });

    io.emit(`Paid ${amount} ${tokenUpper === "MON" ? "MON" : token} to ${to} on ${chain.name}. TxHash: ${hash}`);
    io.emit(`Explorer: ${chain.explorerUrl}/tx/${hash}`);

    return {
      transactionHash: hash,
      to,
      amount,
      token,
      memo,
      chainId: chain.chainId,
    };
  }
}
