import { z } from "zod";

/**
 * Verified Monad Testnet specifications.
 * Pinned for Monad Metropolis Hackathon (Chain ID 10143).
 */
export const MONAD_TESTNET_CHAIN_ID = 10143 as const;
export const MONAD_TESTNET_CAIP2 = `eip155:${MONAD_TESTNET_CHAIN_ID}` as const;
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz/" as const;
export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadexplorer.com" as const;
export const MONAD_TESTNET_MONADVISION_URL = "https://monadvision.com" as const;
export const MONAD_TESTNET_MONADSCAN_URL = "https://testnet.monadscan.com" as const;

/**
 * Official Monad x402 Facilitator & Testnet USDC
 * Canonical per docs.monad.xyz/guides/x402 and tooling-and-infra/agentic-payments
 */
export const MONAD_TESTNET_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;
export const MONAD_X402_FACILITATOR_URL = "https://x402-facilitator.molandak.org" as const;

/**
 * Deployed MonadAgentRegistry and MonadA2AEscrow on Monad Testnet (Chain ID 10143)
 */
export const MONAD_DEPLOYED_AGENT_REGISTRY =
  "0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51" as const;
export const MONAD_DEPLOYED_A2A_ESCROW =
  "0x31665c49a8e0565f3e496080a08f089d29bbcaae" as const;

export const MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY = MONAD_DEPLOYED_AGENT_REGISTRY;
export const MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY = MONAD_DEPLOYED_AGENT_REGISTRY;
export const MONAD_TESTNET_ERC8004_AGENT_REGISTRY =
  `eip155:10143:${MONAD_DEPLOYED_AGENT_REGISTRY}` as const;

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
  explorers: {
    monadExplorer: MONAD_TESTNET_EXPLORER_URL,
    monadScan: MONAD_TESTNET_MONADSCAN_URL,
    monadVision: MONAD_TESTNET_MONADVISION_URL,
  },
  tokens: {
    USDC: MONAD_TESTNET_USDC,
  },
  x402: {
    facilitatorUrl: MONAD_X402_FACILITATOR_URL,
    defaultNetwork: MONAD_TESTNET_CAIP2,
  },
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
