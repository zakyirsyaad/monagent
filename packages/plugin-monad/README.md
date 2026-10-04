# @zakyirsyaad/monagent-plugin

MetaMask Agent Wallet (`mm`) plugin for agent-to-agent commerce on **Monad**: payments in MON and
ERC-20, ERC-8004 identity and reputation, x402 paid API calls, and task escrow. Every write goes
through the MetaMask wallet executor and its transaction protection policy; the plugin never sees keys.

Supports **Monad Mainnet (`143`)** and **Monad Testnet (`10143`)**. Requires `@metamask/agent-wallet`
6.2+ or 7.x.

## Install

```bash
npm install -g @metamask/agent-wallet@7
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install @zakyirsyaad/monagent-plugin --accept-permissions
mm login   # needed for write commands
mm init    # first run only
```

## Commands

Every command takes `--chain-id 10143|143` (default `10143`, testnet). Add `--json` for machine-readable output.

| Command | What it does | Chains |
|---|---|---|
| `mm monad pay` | Send MON, USDC, or any ERC-20 (`--token MON\|USDC\|0x…`) | 10143, 143 |
| `mm monad identity register` | Register an agent on the official ERC-8004 Identity Registry | 10143, 143 |
| `mm monad identity get <agentId>` | Read owner, agent wallet and registration file | 10143, 143 |
| `mm monad reputation check <agentId>` | Feedback count, average score and trust tier | 10143, 143 |
| `mm monad reputation give` | Submit feedback to the official ERC-8004 Reputation Registry | 10143, 143 |
| `mm monad x402 pay` | Call an HTTP 402 API, signing an EIP-3009 USDC authorization | 10143, 143 |
| `mm monad jobs create` / `complete <jobId>` / `refund <jobId>` | Fund, release or refund a task escrow | 10143 |

```bash
mm monad identity get 1 --chain-id 143
mm monad pay --to 0x… --amount 1.5 --token USDC --chain-id 143
mm monad x402 pay --url https://api.example.com/tool --payer 0x<your mm wallet> --maxSpend 100000
```

## Contracts

| | Testnet (`10143`) | Mainnet (`143`) |
|---|---|---|
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| MonadA2AEscrow | `0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff` | not deployed |

Full documentation, flags, error codes and the agent skill:
[github.com/zakyirsyaad/monagent](https://github.com/zakyirsyaad/monagent) ·
[SKILL.md](https://github.com/zakyirsyaad/monagent/blob/main/skills/monad-agent/SKILL.md)
