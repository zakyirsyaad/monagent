# CLAUDE.md

Guidance for Claude Code and coding agents working in this repository.

## What this repo is

**MonAgent** — MetaMask Agent Wallet Plugin for **Monad** (Testnet Chain ID `10143` and Mainnet Chain ID `143`).
Built for the **Monad Metropolis Hackathon** (evm/accathon, Track: *Best Agent Wallet Plugin* by MetaMask Developer).

This project implements **Agent-to-Agent (A2A) Commerce & Trustless Infrastructure** on Monad:
- Autonomous Direct Payments in native `MON` and ERC-20 tokens (e.g. `USDC` and custom contract addresses)
- Trustless Agent Identity via **ERC-8004 Identity Registry** on Monad
- Immutable On-Chain Feedback via **ERC-8004 Reputation Registry** on Monad
- A2A Task Escrow & Subcontracting on Monad Testnet
- Paid Tool Calls & Micropayments via **x402 protocol**

---

## Architecture & Workspaces

```
packages/
  plugin-monad/     MetaMask Agent Wallet Plugin (@metamask/agent-wallet oclif-plugin)
                    Commands: mm monad:pay, mm monad:identity:*, mm monad:reputation:*, mm monad:jobs:*, mm monad:x402:*
skills/
  monad-agent/      Official hackathon skill definition (SKILL.md) for AI agents
scripts/
  demo-monad-plugin.ts  End-to-end demonstration script for demo video & canary verification
```

---

## Verified Monad Network Facts

```
resource / chain    Monad Testnet (10143)                         Monad Mainnet (143)
-------------------------------------------------------------------------------------------------------
CAIP-2              eip155:10143                                  eip155:143
native currency     MON (18 decimals)                             MON (18 decimals)
canonical RPC       https://testnet-rpc.monad.xyz/                https://rpc.monad.xyz/
explorer            https://testnet.monadexplorer.com             https://monadexplorer.com
ERC-8004 Identity   0x8004A818BFB912233c491871b3d84c89A494BD9e   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ERC-8004 Reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713   0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
USDC (6 decimals)   0x534b2f3A21130d7a60830c2Df862319e593943A3   0x754704Bc059F8C67012fEd69BC8A327a5aafb603
A2A Escrow          0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff   not deployed (ESCROW_NOT_DEPLOYED)
x402 Facilitator    https://x402-facilitator.molandak.org         https://x402-facilitator.molandak.org
```

---

## MetaMask Agent Wallet Plugin Model

1. **Host Context (`this.ctx`)**: Commands extend `PluginCommand` from `@metamask/agent-wallet/plugin`.
2. **Read Operations**: Queries execute through `this.getPublicClient(chainId)` (proxied host Viem client with fallback to canonical Monad RPC on transport errors).
3. **Write Operations**: Mutations route through `executeTransaction(this.ctx, io, commandId, params)`.
4. **Sandboxed Key Security**: Plugins never touch session files, mnemonics, or raw private keys. Every transaction is inspected and approved by the MetaMask transaction protection policy engine.

---

## Commands

```bash
npm install                                             # install monorepo dependencies
npm test --workspace @zakyirsyaad/monagent-plugin       # test MetaMask plugin commands
npm run typecheck                                       # typecheck full repo
node --test scripts/repository-contents.test.mjs        # verify clean repository contents
cd contracts && forge test                              # run Solidity tests
```
