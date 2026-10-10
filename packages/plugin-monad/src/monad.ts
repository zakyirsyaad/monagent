import { parseAbi } from "viem";
import { z } from "zod";
import { CommandError } from "@metamask/agent-wallet/plugin";

/**
 * Verified Monad Testnet & Mainnet specifications.
 * Pinned for Monad Metropolis Hackathon.
 */
export const MONAD_MAINNET_CHAIN_ID = 143 as const;
export const MONAD_TESTNET_CHAIN_ID = 10143 as const;
export const MONAD_MAINNET_CAIP2 = `eip155:${MONAD_MAINNET_CHAIN_ID}` as const;
export const MONAD_TESTNET_CAIP2 = `eip155:${MONAD_TESTNET_CHAIN_ID}` as const;

export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz/" as const;
export const MONAD_MAINNET_RPC_URL = "https://rpc.monad.xyz/" as const;
export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadexplorer.com" as const;
export const MONAD_MAINNET_EXPLORER_URL = "https://monadexplorer.com" as const;
export const MONAD_TESTNET_MONADSCAN_URL = "https://testnet.monadscan.com" as const;
export const MONAD_TESTNET_MONADVISION_URL = "https://monadvision.com" as const;

/**
 * Official Canonical ERC-8004 Registries on Monad Testnet (10143) and Mainnet (143)
 */
export const MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const MONAD_MAINNET_ERC8004_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const MONAD_MAINNET_ERC8004_REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

/**
 * Canonical USDC addresses (6 decimals, EIP-712 version "2")
 */
export const MONAD_TESTNET_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;
export const MONAD_MAINNET_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
export const MONAD_X402_FACILITATOR_URL = "https://x402-facilitator.molandak.org" as const;

/**
 * Deployed MonadA2AEscrow on Monad Testnet (Chain ID 10143)
 */
export const MONAD_DEPLOYED_A2A_ESCROW =
  "0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff" as const;
export const MONAD_DEPLOYED_AGENT_REGISTRY =
  "0x91f80eb44d9082d8881b116696cd8840680e3a1c" as const;

export interface MonadChainConfig {
  chainId: 10143 | 143;
  name: string;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
  usdc: `0x${string}`;
  escrow?: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  caip2: `eip155:10143` | `eip155:143`;
}

/**
 * Single per-chain table for Monad Testnet (10143) and Monad Mainnet (143)
 */
export const MONAD_CHAINS: Record<10143 | 143, MonadChainConfig> = {
  10143: {
    chainId: 10143,
    name: "Monad Testnet",
    identityRegistry: MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY,
    reputationRegistry: MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY,
    usdc: MONAD_TESTNET_USDC,
    escrow: MONAD_DEPLOYED_A2A_ESCROW,
    rpcUrl: MONAD_TESTNET_RPC_URL,
    explorerUrl: MONAD_TESTNET_EXPLORER_URL,
    caip2: MONAD_TESTNET_CAIP2,
  },
  143: {
    chainId: 143,
    name: "Monad Mainnet",
    identityRegistry: MONAD_MAINNET_ERC8004_IDENTITY_REGISTRY,
    reputationRegistry: MONAD_MAINNET_ERC8004_REPUTATION_REGISTRY,
    usdc: MONAD_MAINNET_USDC,
    escrow: undefined,
    rpcUrl: MONAD_MAINNET_RPC_URL,
    explorerUrl: MONAD_MAINNET_EXPLORER_URL,
    caip2: MONAD_MAINNET_CAIP2,
  },
};

/**
 * Resolves a chain input (number | string | undefined), defaulting safely to 10143.
 * Throws CommandError("UNSUPPORTED_CHAIN", ...) for any other chain.
 */
export function resolveChain(input?: number | string): MonadChainConfig {
  if (input === undefined || input === null || input === "") {
    return MONAD_CHAINS[10143];
  }
  const parsed = Number(input);
  if (parsed === 10143 || parsed === 143) {
    return MONAD_CHAINS[parsed];
  }
  throw new CommandError(
    "UNSUPPORTED_CHAIN",
    `Chain ID "${input}" is not supported. MonAgent supports Monad Testnet (10143) and Monad Mainnet (143).`,
    "Specify --chain-id 10143 or --chain-id 143."
  );
}

export function getErc8004IdentityRegistry(chainId: number): `0x${string}` {
  return resolveChain(chainId).identityRegistry;
}

export function getErc8004ReputationRegistry(chainId: number): `0x${string}` {
  return resolveChain(chainId).reputationRegistry;
}

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
    agentRegistry: `eip155:10143:${MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY}`,
  },
});

/**
 * Official ERC-8004 Identity Registry ABI
 */
export const erc8004IdentityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

/**
 * Official ERC-8004 Reputation Registry ABI
 */
export const erc8004ReputationAbi = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getClients(uint256 agentId) view returns (address[])",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

/**
 * Monad A2A Escrow ABI
 */
export const monadEscrowAbi = parseAbi([
  "function createAndFundJob(address worker, string calldata taskDescription, uint256 durationHours) payable returns (uint256 jobId)",
  "function completeJob(uint256 jobId, string calldata resultURI) external",
  "function refundExpiredJob(uint256 jobId) external",
  "function getJob(uint256 jobId) external view returns ((address client, address worker, uint256 bounty, uint256 deadline, uint8 status, string taskDescription, string resultURI))",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed worker, uint256 bounty)",
  "event JobCompleted(uint256 indexed jobId, string resultURI)",
  "event JobRefunded(uint256 indexed jobId)",
]);

/**
 * Schemas for inputs
 */
export const monadPaymentInputSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Monad recipient address"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive decimal string"),
  token: z.string().default("MON"),
  memo: z.string().max(256).optional(),
  chainId: z.string().optional(),
});
export type MonadPaymentInput = z.infer<typeof monadPaymentInputSchema>;

export const monadAgentCardSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(512),
  endpoints: z.array(z.string().url()).min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  supportedProtocols: z.array(z.string()).default(["mcp", "x402"]),
  active: z.boolean().default(true),
});
export type MonadAgentCard = z.infer<typeof monadAgentCardSchema>;

export const monadReputationFeedbackSchema = z.object({
  agentId: z.string().regex(/^\d+$/, "agentId must be a numeric string"),
  value: z.coerce.number().int().min(-100).max(100),
  decimals: z.coerce.number().int().min(0).max(2).default(0),
  tag1: z.string().max(32).default("general"),
  tag2: z.string().max(32).default("task"),
  endpoint: z.string().url().or(z.literal("")).default(""),
  feedbackURI: z.string().url().or(z.literal("")).default(""),
  chainId: z.string().optional(),
});
export type MonadReputationFeedback = z.infer<typeof monadReputationFeedbackSchema>;

export const monadCreateJobSchema = z.object({
  workerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid worker address"),
  bountyMon: z.string().regex(/^\d+(\.\d+)?$/, "Bounty must be a positive decimal string"),
  taskDescription: z.string().min(1).max(500),
  deadlineHours: z.coerce.number().int().min(1).max(168).default(24),
  chainId: z.string().optional(),
});
export type MonadCreateJob = z.infer<typeof monadCreateJobSchema>;

export const monadCompleteJobSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
  resultURI: z.string().default("ipfs://settled"),
  chainId: z.string().optional(),
});
export type MonadCompleteJob = z.infer<typeof monadCompleteJobSchema>;

export const monadRefundJobSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
  chainId: z.string().optional(),
});
export type MonadRefundJob = z.infer<typeof monadRefundJobSchema>;

export const monadX402PaySchema = z.object({
  url: z.string().min(1, "URL is required"),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.string().optional(),
  maxSpend: z
    .string()
    .regex(/^\d+$/, "maxSpend must be integer base units")
    .optional()
    .default("1000000"),
  payer: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .refine((val) => val.toLowerCase() !== "0x0000000000000000000000000000000000000000", {
      message: "Non-zero address required",
    }),
  chainId: z.union([z.number(), z.string()]).optional(),
});
export type MonadX402PayInput = z.infer<typeof monadX402PaySchema>;

