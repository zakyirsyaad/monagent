# MonAgent — MetaMask Agent Wallet Plugin for Monad

> Official submission for **Monad Metropolis Hackathon** (Track: *Best Agent Wallet Plugin* by MetaMask Developer).

An autonomous payment, trust, and commerce plugin for the **MetaMask Agent Wallet (`mm` CLI)** operating on **Monad Testnet** (Chain ID `10143`).

---

## Features (Suggested Starting Point 05: A2A Commerce & Trust)

1. **Autonomous Direct Payments (`mm monad:pay`)**:
   - Send instant micro-payments in native `MON` or tokens with sub-second finality.
   - Gated by MetaMask transaction protection policy engine.

2. **Trustless Agent Identity (`mm monad:identity:*`)**:
   - Mint and register an ERC-721 Agent ID on Monad's official **ERC-8004 Identity Registry** (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`).
   - Store and verify agent metadata cards, service endpoints, and wallet addresses.

3. **On-Chain Reputation & Feedback (`mm monad:reputation:*`)**:
   - Query counterparty track records and compute trust tiers (`HIGH`, `MEDIUM`, `LOW`, `UNRATED`) before high-value transactions.
   - Submit permanent, immutable feedback to Monad's **ERC-8004 Reputation Registry** (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`).

4. **x402 Micropayments (`mm monad:x402:pay`)**:
   - Pay-per-call API endpoints returning HTTP `402 Payment Required` using Monad transactions.

5. **A2A Task Escrow & Subcontracting (`mm monad:jobs:create`)**:
   - Subcontract tasks to worker agents with guaranteed escrow funding and cryptographic proof verification.

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

## Interactive End-to-End Demo

npm test --workspace @zakyirsyaad/monagent-plugin
npm test --workspace @zakyirsyaad/monagent-shared
```bash
npm run demo:local
```

---

## Development & Testing

```bash
npm install
npm test --workspace @monagent/plugin-monad
npm test --workspace @monagent/shared
npm run typecheck
```

---

## Live Monad Testnet Contract Deployments

- **Network**: Monad Testnet (`Chain ID 10143`)
- **RPC**: `https://testnet-rpc.monad.xyz/`
- **MonadAgentRegistry (ERC-8004 Identity & Reputation)**:
  [`0x91f80eb44d9082d8881b116696cd8840680e3a1c`](https://testnet.monadexplorer.com/address/0x91f80eb44d9082d8881b116696cd8840680e3a1c)
- **MonadA2AEscrow (A2A Subcontracting Escrow)**:
  [`0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff`](https://testnet.monadexplorer.com/address/0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff)
- **Official x402 Facilitator**: `https://x402-facilitator.molandak.org`
- **Testnet USDC**: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
