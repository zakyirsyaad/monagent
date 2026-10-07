# MonAgent reference

Full command reference, networks and contracts, AI agent integrations, and troubleshooting.
For the overview and quickstart, see the [README](./README.md).

- [Networks and contracts](#networks-and-contracts)
- [Command reference](#command-reference)
- [AI agent integrations](#ai-agent-integrations)
- [Troubleshooting](#troubleshooting)

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

### Escrow (deployed on testnet only; see Status and limits in the README)
```bash
mm monad jobs create --workerAddress 0x7777777777777777777777777777777777777777 \
  --bountyMon 0.1 --taskDescription "Generate neural embeddings" --deadlineHours 24

mm monad jobs complete 1 --resultURI ipfs://<deliverable>   # client releases the bounty
mm monad jobs refund 1                                      # client, after the deadline
```

---

## AI agent integrations

Any agent that can run shell commands can already call `mm monad … --json`. Three packages make that
easier. All of them rely on the local `mm` CLI, so they must run on the machine where `mm` is installed
and signed in; none of them holds keys.

| Route | What you get | Install |
|---|---|---|
| **Skill** | Rules, flows and an error-code table the agent reads | `mm monad skill --install claude-user` |
| **Claude Code plugin** | The skill and the MCP server, from this repo's marketplace | `/plugin marketplace add zakyirsyaad/monagent` |
| **MCP server** | Nine typed tools for any MCP client | `claude mcp add monagent -- npx -y @zakyirsyaad/monagent-mcp` |

### Agent skill

The skill (`SKILL.md`) ships inside the plugin package. After installing the plugin:

```bash
mm monad skill                                    # print it (the text is in data.content with --json)
mm monad skill --install claude-project           # .claude/skills/monad-agent/SKILL.md in this project
mm monad skill --install claude-user              # ~/.claude/skills/monad-agent/SKILL.md
mm monad skill --install codex-project            # also: codex-user, agents-project, agents-user
mm monad skill --json | jq -r .data.content > SKILL.md    # a clean markdown file
```

`--install` refuses to overwrite an existing file (`FILE_EXISTS`) unless you add `--force`.

### Claude Code plugin

```bash
/plugin marketplace add zakyirsyaad/monagent
/plugin install monagent@monagent-marketplace
```

It bundles the shared skill, starts the MCP server below, and adds four workflow agents — each with
its own skill and slash command, and the same guardrails in every prompt (read first, confirm before
every write, explicit `--chain-id`, no blind write retries, stop on `[AWAITING_MFA]`, never touch
keys):

| Workflow | Agent | Skill | Slash command | Writes |
|---|---|---|---|---|
| Vet a counterparty | `counterparty-vetter` | `vet-counterparty` | `/monad-vet <agentId> [chainId]` | no — read-only, both chains |
| Pay a vetted agent | `agent-payer` | `pay-vetted-agent` | `/monad-pay-agent <agentId> <amount> <token>` | yes — mainnet `143`, after explicit confirmation |
| Buy a paid API call | `api-buyer` | `buy-x402-api` | `/monad-buy-api <url>` | yes — x402, after confirming cap and payer |
| Register my agent | `identity-registrar` | `register-agent-identity` | `/monad-register-agent` | yes — mainnet `143`, after explicit confirmation |

There is no escrow or hiring workflow: MetaMask currently rejects testnet writes, so the escrow
commands can't complete (see Status and limits in the README).

**Skill sources:** the shared `monad-agent` skill is sourced at `skills/monad-agent/SKILL.md` and
synced into `claude-plugin/skills/` and the npm package by `packages/plugin-monad/scripts/sync-skill.mjs`.
The four workflow skills are sourced at `claude-plugin/skills/<workflow>/SKILL.md` and ship only in
the Claude Code plugin, not in the npm package. `scripts/claude-plugin.test.mjs` and
`scripts/agent-workflows.test.mjs` enforce this layout. You still run `mm login`, `mm init` and
approve writes yourself.

### MCP server

`@zakyirsyaad/monagent-mcp` is a stdio server that wraps the `mm` CLI. Add it to Claude Code with the
command above, or to any client's MCP settings:

```json
{
  "mcpServers": {
    "monagent": {
      "command": "npx",
      "args": ["-y", "@zakyirsyaad/monagent-mcp"]
    }
  }
}
```

- **Tools:** `monad_pay`, `monad_identity_register`, `monad_identity_get`, `monad_reputation_check`,
  `monad_reputation_give`, `monad_x402_pay`, `monad_jobs_create`, `monad_jobs_complete`,
  `monad_jobs_refund`. Reads are annotated read-only; writes are not.
- **Writes need an explicit `chainId`** (reads default to testnet), so a model can't pick a chain by accident.
- **No automatic retries on writes.** A timed-out or errored write may still have been sent, so the
  server returns the error and leaves the decision to the caller.
- **Errors keep the plugin's codes** (`UNSUPPORTED_CHAIN`, `PAYER_MISMATCH`, …), which are listed in
  [SKILL.md](./skills/monad-agent/SKILL.md#error-codes).
- It starts only if it finds `mm` 6.2+ or 7.x with this plugin installed. Set `MM_PATH` if `mm` isn't on `PATH`.

---

## Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `PLUGIN_CLI_VERSION … requires CLI …` | Plugin older than 0.1.3 on CLI 7.x | `mm plugins install @zakyirsyaad/monagent-plugin@latest` |
| `No CLI refresh token available` | Write command without a session | `mm login`, then `mm init` on first run |
| `PLUGIN_METADATA_UNAVAILABLE … E404` | Version published minutes ago | Wait a minute and retry |
| `ESCROW_NOT_DEPLOYED` | `jobs` on mainnet | Use `--chain-id 10143` |
| `[AWAITING_MFA]` | Write is waiting for approval | Approve in MetaMask, then `mm wallet requests watch <id>` |
| `Invalid chainId` or a write stuck on `Submitting...` on `--chain-id 10143` | MetaMask's wallet service doesn't support writes on Monad testnet | Stop the command (Ctrl+C), nothing was sent. Use `--chain-id 143` |
| `FILE_EXISTS` from `mm monad skill --install` | The skill file is already installed | Add `--force` to overwrite it |
| `[monagent-mcp] Startup verification failed` | `mm` missing, too old, or the plugin isn't installed | Install `mm` 6.2+/7.x and the plugin, or set `MM_PATH` |
