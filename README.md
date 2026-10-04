# MonAgent — MetaMask Agent Wallet Plugin for Monad

> Submission for the **Monad Metropolis Hackathon**, track *Best Agent Wallet Plugin* (MetaMask).

MonAgent adds agent-to-agent commerce to the **MetaMask Agent Wallet (`mm` CLI)** on **Monad Mainnet
(`143`)** and **Monad Testnet (`10143`)**. An AI agent can pay another agent, prove who it is, check a
counterparty's track record before trusting it, pay for API calls over x402, and hire other agents
through escrow. It does all of that without ever holding a private key: every transaction and
signature is executed and policy-checked by MetaMask.

```bash
npm install -g @metamask/agent-wallet@7
mm plugins install @zakyirsyaad/monagent-plugin --accept-permissions
mm monad identity get 1 --chain-id 143
```

[npm package](https://www.npmjs.com/package/@zakyirsyaad/monagent-plugin) ·
[Agent skill (SKILL.md)](./skills/monad-agent/SKILL.md)

---

## What an agent can do

| Need | Command | Built on |
|---|---|---|
| Pay another agent | `mm monad pay` | MON, USDC or any ERC-20 |
| Have an on-chain identity | `mm monad identity register` / `get` | Official ERC-8004 Identity Registry |
| Decide whether to trust a counterparty | `mm monad reputation check` | Official ERC-8004 Reputation Registry |
| Leave feedback after a job | `mm monad reputation give` | Official ERC-8004 Reputation Registry |
| Pay per call for a paid API or tool | `mm monad x402 pay` | x402 (`@x402/core`, `@x402/evm`), EIP-3009 USDC |
| Hire an agent with funds held in escrow | `mm monad jobs create` / `complete` / `refund` | `MonadA2AEscrow` (this repo) |

A typical flow: check the worker's reputation → fund an escrow job → release it when the work is
delivered → rate the worker. Each step is one `mm` command an agent can call with `--json`.

---

## How it works

```mermaid
flowchart LR
  A[AI agent] -->|"mm monad … --json"| H[MetaMask Agent Wallet CLI]
  H -->|restricted context| P[MonAgent plugin]
  P -->|reads| R[(Monad RPC)]
  P -->|tx / EIP-712 request| E[MetaMask wallet executor]
  E -->|policy check + approval| E
  E -->|signed tx| M[(Monad 143 / 10143)]
  M --- I[ERC-8004 Identity]
  M --- Q[ERC-8004 Reputation]
  M --- U[USDC]
  M --- X[MonadA2AEscrow]
  P -->|EIP-3009 authorization| S[x402 server / facilitator]
```

- Commands extend the host's `PluginCommand` and declare their inputs with the host `InputSchema`, so
  every option is a regular CLI flag and works non-interactively.
- Reads go through the host's public client, falling back to the canonical Monad RPC on transport errors.
- Writes and signatures go through `ctx.walletExecutor`: the plugin builds the transaction or EIP-712
  payload, and MetaMask decides whether to sign it. Writes can pause for approval (`AWAITING_MFA`).

### Safety rules the plugin enforces
- **Testnet by default.** Every command uses `10143` unless `--chain-id 143` is passed. Other chain ids
  fail with `UNSUPPORTED_CHAIN` before anything is signed.
- **x402 signs exactly what it checked.** It only accepts a payment requirement on the requested chain,
  enforces `--maxSpend` on that requirement, signs only that one, then recovers the signer and aborts
  (`PAYER_MISMATCH`) if it isn't `--payer`. Nothing is sent to the server unless all checks pass.
- **Escrow funds move only on the client's decision.** Only the client can `complete` or `refund` a
  job; the worker can't pay itself. Escrow commands fail with `ESCROW_NOT_DEPLOYED` before any wallet
  prompt on chains without an escrow contract.
- **Read-only commands don't need a login**; write commands use the host's normal auth gate.

---

## Networks and contracts

| | Monad Testnet (`10143`) | Monad Mainnet (`143`) |
|---|---|---|
| CAIP-2 | `eip155:10143` | `eip155:143` |
| RPC | `https://testnet-rpc.monad.xyz/` | `https://rpc.monad.xyz/` |
| Explorer | `https://testnet.monadexplorer.com` | `https://monadexplorer.com` |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| USDC (6 decimals) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| MonadA2AEscrow | `0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff` | not deployed (`ESCROW_NOT_DEPLOYED`) |

The ERC-8004 registries are the official deployments; the escrow is this repo's
[`contracts/src/MonadA2AEscrow.sol`](./contracts/src/MonadA2AEscrow.sol).

---

## Quickstart

Requires Node.js 22+ and `@metamask/agent-wallet` **6.2+ or 7.x**.

```bash
# 1. Install the MetaMask Agent Wallet CLI
npm install -g @metamask/agent-wallet@7

# 2. Allow plugins, then install MonAgent
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install @zakyirsyaad/monagent-plugin --accept-permissions

# 3. Try a read (no login needed)
mm monad identity get 1 --chain-id 143

# 4. Sign in before any write command
mm login
mm init        # first run only
```

Fund the wallet with MON for gas: testnet from [faucet.monad.xyz](https://faucet.monad.xyz), mainnet MON
for `--chain-id 143`.

---

## Command reference

Every command accepts `--chain-id 10143|143` (default `10143`) and the host's output flags
(`--json`, `--format`, `--verbose`). Commands that send a transaction print its explorer link.

### Payments
```bash
# Native MON
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 0.5 --token MON

# USDC on mainnet (6 decimals handled for you)
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 10 --token USDC --chain-id 143

# Any ERC-20: the plugin checks the contract exists and reads decimals() on-chain
mm monad pay --to 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa --amount 25 --token 0x<token address> --chain-id 143
```
`--memo` is echoed in the command output only; it is not stored on-chain.

### Identity (ERC-8004)
```bash
mm monad identity register \
  --name "MonadArbitrageBot" \
  --description "High-speed DEX arbitrage agent" \
  --walletAddress 0x6beda6290a60a07ddb4Bf9D42A0D8d4E24E535Fa \
  --endpoint https://agent.example.com \
  --chain-id 143

mm monad identity get 1 --chain-id 143
```
`register` stores an ERC-8004 registration file (name, description, A2A and MCP service endpoints) as
the token URI and returns the new `agentId` from the `Registered` event. The registry's agent wallet
starts as the owner's address. `--walletAddress` is validated and echoed in the output, but it is not
written on-chain.

### Reputation (ERC-8004)
```bash
# Trust tier before you transact: HIGH (≥80), MEDIUM (≥50), LOW, or UNRATED
mm monad reputation check 1 --chain-id 143
mm monad reputation check 1 --tag1 speed

# Feedback from -100 to 100
mm monad reputation give --agentId 1 --value 95 --tag1 speed --tag2 reliability --chain-id 143
```
The official registry rejects feedback from an agent's own owner, so rate other agents, not yours.

### x402 paid calls
```bash
mm monad x402 pay \
  --url https://api.example.com/v1/predict \
  --method POST \
  --body '{"query":"market"}' \
  --maxSpend 100000 \
  --payer 0x<address of your active mm wallet> \
  --chain-id 143
```
- `--maxSpend` is in the token's base units: `100000` = 0.1 USDC, `1000000` = 1 USDC.
- `--payer` must be the wallet `mm` signs with; any mismatch aborts before payment.
- The server must offer an `exact` requirement on the chosen chain, otherwise `UNSUPPORTED_PAYMENT_NETWORK`.

### Escrow (testnet)
```bash
mm monad jobs create --workerAddress 0x7777777777777777777777777777777777777777 \
  --bountyMon 0.1 --taskDescription "Generate neural embeddings" --deadlineHours 24

mm monad jobs complete 1 --resultURI ipfs://<deliverable>   # client releases the bounty
mm monad jobs refund 1                                      # client, after the deadline
```

For the full list of error codes and what an agent should do about each, see
[SKILL.md](./skills/monad-agent/SKILL.md#error-codes).

---

## Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `PLUGIN_CLI_VERSION … requires CLI …` | Plugin older than 0.1.3 on CLI 7.x | `mm plugins install @zakyirsyaad/monagent-plugin@latest` |
| `No CLI refresh token available` | Write command without a session | `mm login`, then `mm init` on first run |
| `PLUGIN_METADATA_UNAVAILABLE … E404` | Version published minutes ago | Wait a minute and retry |
| `ESCROW_NOT_DEPLOYED` | `jobs` on mainnet | Use `--chain-id 10143` |
| `[AWAITING_MFA]` | Write is waiting for approval | Approve in MetaMask, then `mm wallet requests watch <id>` |

---

## Development

```bash
npm install
npm run typecheck
npm test --workspace @zakyirsyaad/monagent-plugin   # plugin unit tests (host resolveInputs, x402, ERC-20, chains)
npx tsx --test contracts/test/*.test.ts            # contract simulation tests
node --test scripts/repository-contents.test.mjs
cd contracts && forge test                         # Solidity tests
npm run build --workspace @zakyirsyaad/monagent-plugin
```

`npm run demo:local` walks through the main flows against a **mocked** host and prints placeholder
transaction hashes. With `MONAD_TESTNET_PRIVATE_KEY` set, the MON payment step is sent live on testnet
from a local key; that path bypasses MetaMask and is meant for development only. For a real
demonstration, use the `mm` commands above.

### Layout
```
packages/plugin-monad/   the mm plugin (commands, per-chain config, executor helpers, tests)
contracts/               MonadA2AEscrow + Foundry tests
skills/monad-agent/      SKILL.md: how an AI agent should use the plugin
scripts/                 deploy, live-interaction and demo scripts
```
