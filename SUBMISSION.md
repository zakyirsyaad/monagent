# MetaMask Developer Hackathon Submission: MonAgent

**Track**: Best Agent Wallet Plugin (MetaMask Developer)  
**Category**: Onchain Finance & Trading  
**Project**: MonAgent — MetaMask Agent Wallet Plugin for Monad (Mainnet `143` & Testnet `10143`)  
**Shared Skill Instructions**: [skills/monad-agent/SKILL.md](./skills/monad-agent/SKILL.md)  
**Package**: `@zakyirsyaad/monagent-plugin` on npm  
**MCP Server**: `@zakyirsyaad/monagent-mcp` on npm  

---

## 1. Trader-Focused Capabilities of MonAgent

> **MonAgent turns the MetaMask Agent Wallet into an autonomous agent-to-agent trading desk on Monad** — directly implementing the hackathon's suggested starting point **05: Agent-to-agent commerce** (*A2A trading, paid tool calls via x402 payments + ERC-8004 agent identity/reputation/validation registry*).

### The Trading Superpower: Autonomous A2A Diligence, Settlement, and Trust

In fast-paced on-chain trading, agents need to buy proprietary alpha, hire execution bots, and settle payments autonomously without human micromanagement. However, sending capital to an unverified model is an immediate security vulnerability.

MonAgent equips trading agents on Monad with five foundational capabilities:

1. **Counterparty Diligence Before Capital Goes Out**  
   Before routing funds or private trading strategies to a counterparty, the agent runs `mm monad reputation check <agentId>` against the official **ERC-8004 Reputation Registry**. The plugin computes a verified trust tier (`HIGH` ≥80 / `MEDIUM` ≥50 / `LOW` / `UNRATED` / `UNKNOWN`) that the agent enforces as a strict pre-flight decision rule. The `UNKNOWN` tier is explicitly fail-closed — ensuring that an RPC outage or registry read error can never be conflated with a clean, unreviewed agent (`UNRATED`), immediately halting autonomous capital transfers. The agent also resolves the counterparty's identity card (`mm monad identity get <agentId>`) across on-chain data URIs, IPFS, or HTTPS endpoints with strict anti-SSRF protections and prompt-injection fencing.

2. **Instant Multi-Asset Trade Settlement**  
   Autonomous trading desks settle in the asset the trade demands. `mm monad pay` executes transfers in native `MON`, canonical `USDC` (6 decimals), or custom ERC-20 tokens. Token contract existence and on-chain decimals are checked before any transaction is constructed. The command waits for on-chain receipt confirmation (`status === "success"`) before declaring payment settled, preventing false-positive execution on reverts.

3. **Paid Tool Calls as a Metered Input Cost (x402 Protocol)**  
   Trading models require specialized off-chain signals (e.g. sentiment analytics, mempool heatmaps, order-flow predictions). `mm monad x402 pay` negotiates HTTP 402 Payment Required responses and signs EIP-712 / EIP-3009 USDC authorizations under a strictly enforced `--maxSpend` cap. The agent buys high-value market data per call without API keys or open-ended token approvals.

4. **Subcontracted Execution via A2A Escrow**  
   For heavy computational tasks (Monte-Carlo simulations, DEX arbitrage routing), agents can subcontract tasks using `mm monad jobs create|complete|refund`. Bounty funds are locked on-chain in `MonadA2AEscrow` and released at the client's discretion on completion, or refunded by the client after the deadline expires (v0.x has no automated on-chain deliverable verification or worker dispute recourse). *(Note: the escrow contract is currently deployed on testnet only. While mainnet `143` writes work today, MetaMask's wallet service rejects testnet `10143` writes on Agent Wallet 7.0.0 (`Invalid chainId`), so this flow cannot yet be demonstrated live on testnet; it is fully verified via 24 Foundry unit/fuzz/stress tests and local simulation).*

5. **Compounding On-Chain Reputation Asset**  
   After trade delivery or signal verification, the client agent submits immutable ratings (-100 to 100) via `mm monad reputation give`. Profitable, reliable agents build a verifiable on-chain reputation that lowers future friction and unlocks autonomous delegation.

---

## 2. Security Architecture & MetaMask Policy Compliance

The MetaMask Agent Wallet track judging criteria requires:
> *"Must be a working, installable plugin that routes all transactions through the Agent Wallet with no bypass of signing, policy, or MFA"*

MonAgent enforces this contract at every boundary:

- **Host-Mediated Key Isolation (Not a Sandbox)**: The plugin runs in-process inside `@metamask/agent-wallet`. It never touches private keys, seed phrases, or session credentials. All mutations route strictly through `ctx.walletExecutor`, where the MetaMask Transaction Protection Policy Engine evaluates limits, recipient safety, and triggers MFA when policy thresholds are reached.
- **Fail-Closed Verification**: Transaction receipts are confirmed on-chain before success is reported. If a transaction reverts or times out, explicit failure codes (`TRANSACTION_REVERTED`, `REPUTATION_UNAVAILABLE`, `SIGNATURE_VERIFICATION_FAILED`) are returned without blind retries.
- **SSRF & Prompt-Injection Fencing**: All external URLs and IP endpoints in `x402 pay` and `identity get` are filtered against loopback, RFC1918 private subnets, cloud metadata (AWS/GCP `169.254.169.254`, Azure `168.63.129.16`), and DNS rebinding attacks. Untrusted on-chain metadata is fenced in MCP outputs to protect the host LLM from prompt injection.

---

## 3. How AI Agents Drive MonAgent

MonAgent provides three seamless interfaces for AI agents:

1. **Shared Skill (`skills/monad-agent/SKILL.md`)**: Complete operating manual with decision trees, flag syntax, networks, and error codes for any LLM agent.
2. **Model Context Protocol Server (`@zakyirsyaad/monagent-mcp`)**: 9 typed MCP tools with Zod validation, CLI subprocess isolation, and structured summary formatting.
3. **Claude Code Plugin (`claude-plugin/`)**: Four specialized workflow agents with automated slash commands (`/monad-vet`, `/monad-pay-agent`, `/monad-buy-api`, `/monad-register-agent`).

---

## 4. Verified On-Chain Deployments on Monad

| Resource | Monad Testnet (`10143`) | Monad Mainnet (`143`) |
|---|---|---|
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz/` | `https://rpc.monad.xyz/` |
| **Block Explorer** | `https://testnet.monadexplorer.com` | `https://monadexplorer.com` |
| **ERC-8004 Identity Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| **ERC-8004 Reputation Registry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **Canonical USDC** | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| **x402 Facilitator** | `https://x402-facilitator.molandak.org` | `https://x402-facilitator.molandak.org` |
| **A2A Escrow** | `0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff` | Deployment pending mainnet |
