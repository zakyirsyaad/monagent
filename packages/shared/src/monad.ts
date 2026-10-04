import { z } from "zod";

/**
 * Verified Monad Testnet specifications.
 * Pinned for Monad Metropolis Hackathon (Chain ID 10143).
 */
export const MONAD_TESTNET_CHAIN_ID = 10143 as const;
export const MONAD_TESTNET_CAIP2 = `eip155:${MONAD_TESTNET_CHAIN_ID}` as const;
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz/" as const;
export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadexplorer.com" as const;

/**
 * Official ERC-8004 Registries on Monad Testnet
 * Canonical addresses per docs.monad.xyz/guides/erc-8004
 */
export const MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
export const MONAD_TESTNET_ERC8004_AGENT_REGISTRY =
  `eip155:10143:${MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY}` as const;

export const MONAD_NETWORK = Object.freeze({
  chainId: MONAD_TESTNET_CHAIN_ID,
  caip2: MONAD_TESTNET_CAIP2,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrl: MONAD_TESTNET_RPC_URL,
  explorerUrl: MONAD_TESTNET_EXPLORER_URL,
  erc8004: {
    identityRegistry: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
    reputationRegistry: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
    agentRegistry: MONAD_TESTNET_ERC8004_AGENT_REGISTRY,
  },
});

export const monadChainIdSchema = z.literal(MONAD_TESTNET_CHAIN_ID);
export type MonadChainId = z.infer<typeof monadChainIdSchema>;

/**
 * Input schema for Monad Agent Card (ERC-8004)
 */
export const monadAgentCardSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(512),
  endpoints: z.array(z.string().url()).min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  supportedProtocols: z.array(z.string()).default(["mcp", "x402"]),
  active: z.boolean().default(true),
});
export type MonadAgentCard = z.infer<typeof monadAgentCardSchema>;

/**
 * Input schema for Monad on-chain feedback rating (ERC-8004)
 */
export const monadReputationFeedbackSchema = z.object({
  agentId: z.string().min(1),
  value: z.number().int().min(-100).max(100), // -100 to 100 rating scale
  decimals: z.number().int().min(0).max(2).default(0),
  tag1: z.string().max(32).default("general"),
  tag2: z.string().max(32).default("task"),
  endpoint: z.string().url().or(z.literal("")),
  feedbackURI: z.string().url().or(z.literal("")),
});
export type MonadReputationFeedback = z.infer<typeof monadReputationFeedbackSchema>;

/**
 * Input schema for Monad payment
 */
export const monadPaymentInputSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Monad recipient address"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive decimal string"),
  token: z.string().default("MON"),
  memo: z.string().max(256).optional(),
});
export type MonadPaymentInput = z.infer<typeof monadPaymentInputSchema>;

/**
 * Input schema for x402 Micropayments
 */
export const monadX402PaymentSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.string().optional(),
  maxSpendMon: z.string().regex(/^\d+(\.\d+)?$/).default("1.0"),
});
export type MonadX402Payment = z.infer<typeof monadX402PaymentSchema>;
