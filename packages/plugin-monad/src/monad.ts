import { parseAbi } from "viem";
import { z } from "zod";

/**
 * Verified Monad Testnet specifications.
 * Pinned for Monad Metropolis Hackathon (Chain ID 10143).
 */
export const MONAD_MAINNET_CHAIN_ID = 143 as const;
export const MONAD_TESTNET_CHAIN_ID = 10143 as const;
export const MONAD_MAINNET_CAIP2 = `eip155:${MONAD_MAINNET_CHAIN_ID}` as const;
export const MONAD_TESTNET_CAIP2 = `eip155:${MONAD_TESTNET_CHAIN_ID}` as const;

export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz/" as const;
export const MONAD_MAINNET_RPC_URL = "https://rpc.monad.xyz/" as const;
export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadexplorer.com" as const;
export const MONAD_MAINNET_EXPLORER_URL = "https://monadexplorer.com" as const;

/**
 * Official Canonical ERC-8004 Registries on Monad Testnet (10143)
 */
export const MONAD_TESTNET_ERC8004_IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const MONAD_TESTNET_ERC8004_REPUTATION_REGISTRY =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

/**
 * Official Monad x402 Facilitator & Testnet USDC
 */
export const MONAD_TESTNET_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;
export const MONAD_X402_FACILITATOR_URL = "https://x402-facilitator.molandak.org" as const;

/**
 * Deployed MonadA2AEscrow on Monad Testnet (Chain ID 10143)
 * Features client-only release, non-reentrant logic, zeroed bounty before transfer.
 */
export const MONAD_DEPLOYED_A2A_ESCROW =
  "0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff" as const;

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
});
export type MonadReputationFeedback = z.infer<typeof monadReputationFeedbackSchema>;

export const monadCreateJobSchema = z.object({
  workerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid worker address"),
  bountyMon: z.string().regex(/^\d+(\.\d+)?$/, "Bounty must be a positive decimal string"),
  taskDescription: z.string().min(1).max(500),
  deadlineHours: z.coerce.number().int().min(1).max(168).default(24),
});
export type MonadCreateJob = z.infer<typeof monadCreateJobSchema>;

export const monadCompleteJobSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
  resultURI: z.string().default("ipfs://settled"),
});
export type MonadCompleteJob = z.infer<typeof monadCompleteJobSchema>;

export const monadRefundJobSchema = z.object({
  jobId: z.string().regex(/^\d+$/, "jobId must be a numeric string"),
});
export type MonadRefundJob = z.infer<typeof monadRefundJobSchema>;
