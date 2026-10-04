# MonAgent — MetaMask Agent Wallet Plugin for Monad

> Official submission for **Monad Metropolis Hackathon** (Track: *Best Agent Wallet Plugin* by MetaMask Developer).

An autonomous payment, trust, and commerce plugin for the **MetaMask Agent Wallet (`mm` CLI)** operating on **Monad Testnet** (Chain ID `10143`) and **Monad Mainnet** (Chain ID `143`).

---

## Supported Networks

MonAgent natively supports both Monad Testnet and Monad Mainnet across all commands via `--chain-id` (defaults safely to `10143`):

| Resource / Contract | Monad Testnet (`10143`) | Monad Mainnet (`143`) |
|---|---|---|
| **EVM Chain ID** | `10143` | `143` |
| **CAIP-2 Identifier** | `eip155:10143` | `eip155:143` |
| **Canonical RPC** | `https://testnet-rpc.monad.xyz/` | `https://rpc.monad.xyz/` |
| **Block Explorer** | `https://testnet.monadexplorer.com` | `https://monadexplorer.com` |
| **ERC-8004 Identity Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| **ERC-8004 Reputation Registry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| **Canonical USDC** (6 decimals) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| **MonadA2AEscrow** | `0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff` | *Testnet only* (`ESCROW_NOT_DEPLOYED` on 143) |

---

## Features (Suggested Starting Point 05: A2A Commerce & Trust)

1. **Autonomous Direct Payments (`mm monad pay`)**:
   - Send instant micro-payments in native `MON`, canonical `USDC` (6 decimals), or any deployed ERC-20 contract address (`0x...`).
   - Every write transaction outputs a clickable Monad Explorer verification link.
   - Gated by MetaMask transaction protection policy engine.

2. **Trustless Agent Identity (`mm monad identity register` / `mm monad identity get`)**:
   - Mint and register an ERC-721 Agent ID on Monad's official **ERC-8004 Identity Registry** on both Testnet (`10143`) and Mainnet (`143`).
   - Store and verify agent metadata cards, service endpoints, and wallet addresses via standard data URIs.

3. **On-Chain Reputation & Feedback (`mm monad reputation check` / `mm monad reputation give`)**:
   - Query counterparty track records and compute trust tiers (`HIGH`, `MEDIUM`, `LOW`, `UNRATED`) using official `getClients` and `getSummary`.
   - Submit permanent, immutable feedback to Monad's official **ERC-8004 Reputation Registry** on Testnet and Mainnet.

4. **x402 Micropayments (`mm monad x402 pay`)**:
   - Automated negotiation for HTTP `402 Payment Required` APIs using `@x402/core` and `@x402/evm`.
   - Dynamic CAIP-2 network routing (`eip155:10143` or `eip155:143`).
   - Enforces exact requirement signing, strictly verifies recovered signer against `--payer` before transmission, and aborts immediately if signature verification fails.

5. **A2A Task Escrow & Subcontracting (`mm monad jobs create` / `mm monad jobs complete` / `mm monad jobs refund`)**:
   - Subcontract tasks to worker agents with guaranteed escrow funding and client-only release on Monad Testnet.
   - On-chain `jobId` decoded from `JobCreated` receipt event logs.
   - Guarded against unsupported chains: immediately throws `ESCROW_NOT_DEPLOYED` on Mainnet (`143`) before any wallet prompt.

---

## Quickstart

### Installation

```bash
# 1. Install MetaMask Agent Wallet CLI
npm install -g @metamask/agent-wallet@7

# 2. Enable plugins and install MonAgent
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "@zakyirsyaad/monagent-plugin" --accept-permissions
```

### Agent Instruction Skill
Agents operating with this plugin can read the full behavioral specification at:
👉 [`skills/monad-agent/SKILL.md`](./skills/monad-agent/SKILL.md)

---

## Command Reference & Flags

Every command supports `--chain-id 10143 | 143` (defaults to `10143`).

### 1. Direct Payments (Native MON & ERC-20)
```bash
# Pay native MON
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 0.5 --token MON --memo "Service fee"

# Pay USDC on Monad Mainnet (143)
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 10.0 --token USDC --chain-id 143

# Pay custom ERC-20 token with automatic decimals detection
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 25.0 --token 0x8888888888888888888888888888888888888888 --chain-id 143
```

### 2. ERC-8004 Agent Identity
```bash
# Register agent identity on official ERC-8004 registry
mm monad identity register \
  --name "MonadArbitrageBot" \
  --description "High-speed DEX arbitrage agent" \
  --walletAddress "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa" \
  --endpoint "https://agent.example.com" \
  --chain-id 10143

# Query agent identity details on Mainnet (143)
mm monad identity get 1 --chain-id 143

# Query agent identity details on Testnet (10143)
mm monad identity get 1 --chain-id 10143
```

### 3. ERC-8004 Reputation & Feedback
```bash
# Check peer agent reputation & trust tier on Mainnet
mm monad reputation check 1 --chain-id 143

# Check peer agent reputation & trust tier on Testnet
mm monad reputation check 1 --chain-id 10143 --tag1 "speed"

# Submit feedback score (-100 to 100) on Mainnet (143)
mm monad reputation give \
  --agentId 1 \
  --value 95 \
  --tag1 "speed" \
  --tag2 "reliability" \
  --endpoint "https://agent.example.com" \
  --feedbackURI "ipfs://review-proof-hash" \
  --chain-id 143
```

### 4. x402 Micropayments
```bash
mm monad x402 pay \
  --url "https://api.monad-agent.xyz/v1/predict" \
  --method "POST" \
  --body '{"query":"market"}' \
  --maxSpend 1000000 \
  --payer "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa"
```

### 5. A2A Task Escrow & Subcontracting (Testnet 10143)
```bash
# Create and fund escrow job on Testnet
mm monad jobs create \
  --workerAddress 0x7777777777777777777777777777777777777777 \
  --bountyMon 0.1 \
  --taskDescription "Generate neural embeddings" \
  --deadlineHours 24 \
  --chain-id 10143

# Complete job and release bounty (Client only)
mm monad jobs complete 1 --resultURI "ipfs://settled-proof" --chain-id 10143

# Refund expired escrow (Client only after deadline)
mm monad jobs refund 1 --chain-id 10143
```

---

## Interactive End-to-End Demo

```bash
npm run demo:local
```

---

## Development & Testing

```bash
npm install
npm test --workspace @zakyirsyaad/monagent-plugin
npm run typecheck
node --test scripts/repository-contents.test.mjs
cd contracts && forge test
```
