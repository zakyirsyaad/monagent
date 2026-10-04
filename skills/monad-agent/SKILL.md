---
name: monad-agent
description: Instructions for AI agents to interact with Monad Testnet using the MetaMask Agent Wallet Plugin (@zakyirsyaad/monagent-plugin). Covers autonomous direct payments, ERC-8004 trustless agent identity and reputation, x402 micropayments, and subcontracted task escrow.
---

# Monad Agent Wallet Plugin (`mm monad`)

This skill teaches AI agents how to execute financial and trust operations on **Monad Testnet (Chain ID 10143)** using the official **MetaMask Agent Wallet Plugin**.

## Prerequisites

1. Install the MetaMask Agent Wallet CLI (`mm`):
   ```bash
   npm install -g @metamask/agent-wallet@latest
   ```
2. Enable experimental plugins and install `@zakyirsyaad/monagent-plugin`:
   ```bash
   mm config set experimentalPlugins true
   mm config set experimentalAllowUnverifiedInstalls true
   mm plugins install "@zakyirsyaad/monagent-plugin" --accept-permissions
   ```
3. Ensure your agent wallet has Monad testnet funds (`MON`) from the faucet at `https://faucet.monad.xyz`.

---

## Capabilities & Available Commands

### 1. Direct Payments on Monad
Send instant payments in native MON with sub-second finality:
```bash
mm monad pay --to 0xRecipientAddress... --amount 1.5 --token MON --memo "Service fee"
```

### 2. ERC-8004 Trustless Agent Identity
Register your agent identity on-chain on Monad:
```bash
mm monad identity register \
```bash
# 1. Check peer agent reputation before high-value payment (> 5 MON)
mm monad:reputation:check --agentId "1"

# 2. Direct autonomous payment
mm monad:pay --to "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa" --amount "0.5" --token "MON"

# 3. Register agent identity on official ERC-8004 Registry
mm monad:identity:register --name "AutonomousArbitrageur" --description "Monad DEX arbitrage bot" --walletAddress "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa"

# 4. Create and fund A2A subcontracting task escrow
mm monad:jobs:create --workerAddress "0x7777777777777777777777777777777777777777" --bountyMon "0.1" --taskDescription "Generate neural embeddings" --deadlineHours 24

# 5. Complete and release A2A subcontracting task escrow (Client-only release)
mm monad:jobs:complete --jobId "1" --resultURI "ipfs://settled-proof"

# 6. Refund expired escrow
mm monad:jobs:refund --jobId "1"

# 7. Execute x402 paid API request with Monad micropayments
mm monad:x402:pay --url "https://api.monad-agent.xyz/v1/predict" --method "POST" --maxSpendMon "0.05"
```

### 3. ERC-8004 Reputation & Feedback
Before sending high-value payments or hiring another agent, inspect their on-chain track record:
```bash
mm monad reputation check --agentId 42 --tag1 "speed"
```
*Output returns feedbackCount, averageScore (-100 to 100), and trustTier (`HIGH`, `MEDIUM`, `LOW`, `UNRATED`).*

After completing an interaction with a peer agent, submit immutable on-chain feedback:
```bash
mm monad reputation give \
  --agentId 42 \
  --value 95 \
  --tag1 "speed" \
  --tag2 "accuracy" \
  --feedbackURI "https://agent.example.com/audit/report-123.json"
```

### 4. x402 Paid Tool Calls
When an API or off-chain service responds with HTTP `402 Payment Required`, automatically negotiate and pay on Monad:
```bash
mm monad x402 pay --url "https://api.monad-agent-services.com/v1/inference" --maxSpendMon 0.1
```

### 5. A2A Task Escrow & Subcontracting
Subcontract complex tasks to peer agents with guaranteed escrow release on Monad:
```bash
mm monad jobs create \
  --workerAddress 0xWorkerAgentAddress... \
  --bountyMon 2.0 \
  --taskDescription "Generate and verify liquidity analysis report" \
  --deadlineHours 24
```

---

## Agent Safety & Invariants

1. **Non-Custodial Security**: The plugin operates inside the MetaMask Agent Wallet host sandbox. All private keys and seeds remain isolated.
2. **Policy Verification**: Transactions pass through MetaMask's transaction protection policy engine before submission.
3. **Reputation Gating**: Best practice is to run `mm monad reputation check` before initiating transactions exceeding 5 MON to unknown counterparties.
