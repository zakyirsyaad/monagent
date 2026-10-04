# CLAUDE.md

Guidance for Claude Code and coding agents working in this repository.

## What this repo is

**MonAgent** — MetaMask Agent Wallet Plugin for **Monad** (Testnet Chain ID `10143`).
Built for the **Monad Metropolis Hackathon** (evm/accathon, Track: *Best Agent Wallet Plugin* by MetaMask Developer).

This project implements **Agent-to-Agent (A2A) Commerce & Trustless Infrastructure** on Monad:
- Autonomous Direct Payments in native `MON` and ERC-20 tokens
- Trustless Agent Identity via **ERC-8004 Identity Registry** on Monad
- Immutable On-Chain Feedback via **ERC-8004 Reputation Registry** on Monad
- A2A Task Escrow & Subcontracting
- Paid Tool Calls & Micropayments via **x402 protocol**

---

## Architecture & Workspaces

```
packages/
  plugin-monad/     MetaMask Agent Wallet Plugin (@metamask/agent-wallet oclif-plugin)
                    Commands: mm monad:pay, mm monad:identity:*, mm monad:reputation:*, mm monad:jobs:*, mm monad:x402:*
  shared/           @monagent/shared — Monad chain/network metadata, ABIs, Zod schemas
skills/
  monad-agent/      Official hackathon skill definition (SKILL.md) for AI agents
scripts/
  demo-monad-plugin.ts  End-to-end demonstration script for demo video & canary verification
```

---

## Verified Monad Testnet Facts

```
chain name          Monad Testnet
chain ID            10143 (0x279f)
CAIP-2              eip155:10143
native currency     MON (18 decimals)
canonical RPC       https://testnet-rpc.monad.xyz/
explorer            https://testnet.monadexplorer.com / https://testnet.monadscan.com
faucet              https://faucet.monad.xyz
block time          1 second (~10,000 TPS)
ERC-8004 Identity   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ERC-8004 Reputation 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
```

---

## MetaMask Agent Wallet Plugin Model

1. **Host Context (`this.ctx`)**: Commands extend `PluginCommand` from `@metamask/agent-wallet/plugin`.
2. **Read Operations**: Queries execute through `this.ctx.publicClient(10143)` (Viem public client).
3. **Write Operations**: Mutations route through `this.ctx.walletExecutor(io, commandId)`.
4. **Sandboxed Key Security**: Plugins never touch session files, mnemonics, or raw private keys. Every transaction is inspected and approved by the MetaMask transaction protection policy engine.

---

## Commands

```bash
npm install                                       # install monorepo dependencies
npm test --workspace @monagent/plugin-monad      # test MetaMask plugin commands
npm test --workspace @monagent/shared             # test shared Monad schemas and ABIs
npm run typecheck                                 # typecheck full monorepo
npm run demo:local                                # run interactive end-to-end demo
```
