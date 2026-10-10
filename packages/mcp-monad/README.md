# @zakyirsyaad/monagent-mcp

> Model Context Protocol (MCP) server for Monad Agent Wallet (`mm monad …` wrapper)

`monagent-mcp` exposes MonAgent's **Agent-to-Agent (A2A) Commerce & Trustless Infrastructure** on Monad
Mainnet (`143`) and Monad Testnet (`10143`) to any MCP client (Claude Code, Codex, and other LLM agent
runtimes) through safe, typed tools.

---

## Architecture & Security Model

- **No keys, no credentials**: The server holds no private keys, mnemonics, or RPC secrets. By default, `MM_PASSWORD` is omitted from child process environments unless explicitly opted in via `MONAGENT_MCP_ALLOW_BYOK_PASSWORD=1`.
- **Local MetaMask CLI bridge**: Every operation is delegated locally via `spawn(..., { shell: false })` (with strict argument
  arrays, no shell interpolation) to the official MetaMask Agent Wallet (`mm`) CLI.
- **Enforced policy engine**: All transactions, EIP-712/EIP-3009 signatures, and funds movement are
  evaluated by MetaMask's transaction protection policy engine.
- **Safe error handling**: Never automatically retries mutations upon timeout; surfaces explicit error codes
  and `[AWAITING_MFA]` states when human confirmation is needed in MetaMask.

---

## Available Tools (9)

| Tool | Subcommand | Type | Annotations | Description |
|---|---|---|---|---|
| `monad_pay` | `mm monad pay` | Mutation | `destructiveHint: true` | Transfer native `MON`, `USDC`, or custom ERC-20 tokens on Monad. |
| `monad_identity_register` | `mm monad identity register` | Mutation | Writes | Register autonomous agent identity on official Monad ERC-8004 Registry. |
| `monad_identity_get` | `mm monad identity get` | Query | `readOnlyHint: true` | Inspect registered agent profile, wallet address, and off-chain card metadata. |
| `monad_reputation_check` | `mm monad reputation check` | Query | `readOnlyHint: true` | Query feedback summary, average score, and trust tier (`HIGH`/`MEDIUM`/`LOW`). |
| `monad_reputation_give` | `mm monad reputation give` | Mutation | Writes | Submit immutable rating (-100 to 100) for a peer agent to ERC-8004 Registry. |
| `monad_x402_pay` | `mm monad x402 pay` | Mutation | `destructiveHint: true` | Negotiate and sign micropayment authorization (USDC) for HTTP 402 endpoints. |
| `monad_jobs_create` | `mm monad jobs create` | Mutation | `destructiveHint: true` | Create and lock native MON bounty in A2A task escrow (Testnet `10143`). |
| `monad_jobs_complete` | `mm monad jobs complete` | Mutation | Writes | Release escrowed bounty to worker upon verifying deliverable (Testnet `10143`). |
| `monad_jobs_refund` | `mm monad jobs refund` | Mutation | Writes | Reclaim locked bounty after task expiration deadline (Testnet `10143`). |

---

## Prerequisites

1. Node.js `>=22`
2. MetaMask Agent Wallet CLI (`@metamask/agent-wallet` `^6.2.0 || ^7.0.0`)
3. MonAgent plugin installed in `mm`:
   ```bash
   npm install -g @metamask/agent-wallet@7
   mm config set experimentalPlugins true
   mm config set experimentalAllowUnverifiedInstalls true
   mm plugins install @zakyirsyaad/monagent-plugin --accept-permissions
   ```
4. Authenticate once for write operations:
   ```bash
   mm login
   mm init
   ```
   *Note: Human login/init and MFA approvals must be performed on the local machine where `mm` runs.*

---

## Installation & Client Configuration

### Claude Code

Add `monagent` to Claude Code with one command:
```bash
claude mcp add monagent -- npx -y @zakyirsyaad/monagent-mcp
```

Or configure in your project or user `.mcp.json`:
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

### Generic MCP Clients (Cursor, Zed, etc.)

Add to your MCP configuration (such as `~/.cursor/mcp.json` or your MCP client's settings):
```json
{
  "mcpServers": {
    "monagent": {
      "command": "npx",
      "args": ["-y", "@zakyirsyaad/monagent-mcp"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

*Note on BYOK Environment: If using headless BYOK password mode with `mm`, `MM_PASSWORD` can be provided in the `env` block above to unlock the mnemonic.*

---

## Known Limits & Boundary Conditions

- **Human Login / MFA**: Write commands require an authenticated `mm` session. When a transaction triggers MFA,
  the tool returns `[AWAITING_MFA]`. The human operator must approve the transaction in the MetaMask mobile app
  or browser extension.
- **Testnet Writes**: MetaMask's hosted executor currently rejects write transactions on Monad Testnet (`10143`)
  due to gateway chain restrictions. Reads operate on both networks (`143` and `10143`), while writes currently
  require Monad Mainnet (`143`).
