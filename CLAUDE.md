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
ERC-8004 Registry   0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51 (MonadAgentRegistry)
A2A Escrow          0x31665c49a8e0565f3e496080a08f089d29bbcaae (MonadA2AEscrow)
x402 Facilitator    https://x402-facilitator.molandak.org
Testnet USDC        0x534b2f3A21130d7a60830c2Df862319e593943A3
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
