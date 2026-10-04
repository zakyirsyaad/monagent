# MonAgent — MetaMask Agent Wallet Plugin for Monad

> Official submission for **Monad Metropolis Hackathon** (Track: *Best Agent Wallet Plugin* by MetaMask Developer).

An autonomous payment, trust, and commerce plugin for the **MetaMask Agent Wallet (`mm` CLI)** operating on **Monad Testnet** (Chain ID `10143`).

---

## Features (Suggested Starting Point 05: A2A Commerce & Trust)

1. **Autonomous Direct Payments (`mm monad pay`)**:
   - Send instant micro-payments in native `MON` with sub-second finality.
   - Gated by MetaMask transaction protection policy engine.

2. **Trustless Agent Identity (`mm monad identity register` / `mm monad identity get`)**:
   - Mint and register an ERC-721 Agent ID on Monad's official **ERC-8004 Identity Registry** (`0x8004A818BFB912233c491871b3d84c89A494BD9e`).
   - Store and verify agent metadata cards, service endpoints, and wallet addresses via standard data URIs.

3. **On-Chain Reputation & Feedback (`mm monad reputation check` / `mm monad reputation give`)**:
   - Query counterparty track records and compute trust tiers (`HIGH`, `MEDIUM`, `LOW`, `UNRATED`) using `getClients` and `getSummary`.
   - Submit permanent, immutable feedback to Monad's official **ERC-8004 Reputation Registry** (`0x8004B663056A597Dffe9eCcC1965A193B7388713`).

4. **x402 Micropayments (`mm monad x402 pay`)**:
   - Automated negotiation for HTTP `402 Payment Required` APIs using `@x402/core` and `@x402/evm`.
   - Signs EIP-712 authorizations (`TransferWithAuthorization`) via MetaMask wallet executor without raw private key exposure.

5. **A2A Task Escrow & Subcontracting (`mm monad jobs create` / `mm monad jobs complete` / `mm monad jobs refund`)**:
   - Subcontract tasks to worker agents with guaranteed escrow funding and client-only release on Monad.
   - On-chain `jobId` decoded from `JobCreated` receipt event logs.

---

## Quickstart

### Installation

```bash
# 1. Install MetaMask Agent Wallet CLI
npm install -g @metamask/agent-wallet@latest

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

### 1. Direct Payments
```bash
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 0.5 --token MON --memo "Service fee"
```

### 2. ERC-8004 Agent Identity
```bash
# Register agent identity on official ERC-8004 registry
mm monad identity register \
  --name "MonadArbitrageBot" \
  --description "High-speed DEX arbitrage agent" \
  --walletAddress "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa" \
  --endpoint "https://agent.example.com"

# Query agent identity details
mm monad identity get 1 --chain-id 10143
```

### 3. ERC-8004 Reputation & Feedback
```bash
# Check peer agent reputation & trust tier
mm monad reputation check 1 --tag1 "speed"

# Submit feedback score (-100 to 100)
mm monad reputation give \
  --agentId 1 \
  --value 95 \
  --tag1 "speed" \
  --tag2 "reliability" \
  --endpoint "https://agent.example.com" \
  --feedbackURI "ipfs://review-proof-hash"
```

### 4. x402 Micropayments
```bash
mm monad x402 pay \
  --url "https://api.monad-agent.xyz/v1/predict" \
  --method "POST" \
  --body '{"query":"market"}' \
  --maxSpend 1000000
```

### 5. A2A Task Escrow & Subcontracting
```bash
# Create and fund escrow job
mm monad jobs create \
  --workerAddress 0x7777777777777777777777777777777777777777 \
  --bountyMon 0.1 \
  --taskDescription "Generate neural embeddings" \
  --deadlineHours 24

# Complete job and release bounty (Client only)
mm monad jobs complete 1 --resultURI "ipfs://settled-proof"

# Refund expired escrow (Client only after deadline)
mm monad jobs refund 1
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
npm test --workspace @zakyirsyaad/monagent-shared
npm run typecheck
cd contracts && forge test
```

---

## Live Monad Testnet Contract Deployments

- **Network**: Monad Testnet (`Chain ID 10143`)
- **RPC**: `https://testnet-rpc.monad.xyz/`
- **Official ERC-8004 Identity Registry**:
  [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadexplorer.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- **Official ERC-8004 Reputation Registry**:
  [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://testnet.monadexplorer.com/address/0x8004B663056A597Dffe9eCcC1965A193B7388713)
- **MonadA2AEscrow (A2A Subcontracting Escrow)**:
  [`0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff`](https://testnet.monadexplorer.com/address/0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff)
- **Official x402 Facilitator**: `https://x402-facilitator.molandak.org`
- **Testnet USDC**: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
