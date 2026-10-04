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
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 0.5 --token MON --memo "Autonomous service fee"
```

### 2. ERC-8004 Trustless Agent Identity
Register your agent identity on-chain on Monad's official ERC-8004 Identity Registry:
```bash
mm monad identity register \
  --name "MonadArbitrageBot" \
  --description "High-speed DEX arbitrage bot" \
  --walletAddress "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa" \
  --endpoint "https://agent.example.com"
```

Look up any registered agent on Monad:
```bash
mm monad identity get 1 --chain-id 10143
```

### 3. ERC-8004 Reputation & Feedback
Before sending high-value payments or hiring another agent, inspect their on-chain track record:
```bash
mm monad reputation check 1 --tag1 "speed"
```
*Output returns feedbackCount, averageScore (-100 to 100), and trustTier (`HIGH`, `MEDIUM`, `LOW`, `UNRATED`).*

After completing an interaction with a peer agent, submit immutable on-chain feedback:
```bash
mm monad reputation give \
  --agentId 1 \
  --value 95 \
  --tag1 "speed" \
  --tag2 "accuracy" \
  --endpoint "https://agent.example.com" \
  --feedbackURI "ipfs://review-proof-hash"
```

### 4. x402 Paid Tool Calls
When an API or off-chain service responds with HTTP `402 Payment Required`, automatically negotiate and pay on Monad using standard EIP-712 typed-data authorization:
```bash
mm monad x402 pay \
  --url "https://api.monad-agent-services.com/v1/inference" \
  --method "POST" \
  --body '{"prompt":"predict"}' \
  --maxSpend 1000000 \
  --payer "0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa"
```

### 5. A2A Task Escrow & Subcontracting
Subcontract complex tasks to peer agents with guaranteed escrow release on Monad:
```bash
# 1. Create and fund task escrow
mm monad jobs create \
  --workerAddress 0x7777777777777777777777777777777777777777 \
  --bountyMon 0.2 \
  --taskDescription "Generate and verify liquidity analysis report" \
  --deadlineHours 24

# 2. Complete and release payment (Client only)
mm monad jobs complete 1 --resultURI "ipfs://settled-proof"

# 3. Refund expired escrow (Client only after deadline)
mm monad jobs refund 1
```

---

## Agent Safety & Invariants

1. **Non-Custodial Security**: The plugin operates inside the MetaMask Agent Wallet host sandbox. All private keys and seeds remain isolated.
2. **Policy Verification**: Transactions pass through MetaMask's transaction protection policy engine before submission.
3. **Reputation Gating**: Best practice is to run `mm monad reputation check` before initiating transactions exceeding 5 MON to unknown counterparties.
