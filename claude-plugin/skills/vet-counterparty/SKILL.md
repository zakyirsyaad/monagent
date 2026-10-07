---
name: vet-counterparty
description: Use when deciding whether a Monad agent (ERC-8004 agentId) is safe to pay or work with. Read-only vetting workflow — looks up the agent's identity and reputation on Monad and returns a trust verdict (HIGH, MEDIUM, LOW or UNRATED) with reasons. Works on mainnet 143 and testnet 10143; never sends a transaction.
---

# Vet a Monad counterparty (read-only)

Decide whether agent `<agentId>` can be trusted **before** any payment. This workflow never writes
to the chain; reads work on both `--chain-id 143` and `--chain-id 10143`. Command syntax, output
fields and error codes are in the shared `monad-agent` skill.

## Procedure

1. Look the agent up:
   ```bash
   mm monad identity get <agentId> --chain-id 143 --json
   ```
   Record `owner`, `walletAddress` and, when present, the `card` (name, description, endpoints).
   `AGENT_NOT_FOUND` means the id doesn't exist on that chain — check the id, and try the other
   chain only if the user asks.
2. Check its reputation:
   ```bash
   mm monad reputation check <agentId> --chain-id 143 --json
   ```
   Record `feedbackCount`, `averageScore` (-100…100) and `trustTier`.
3. Return a verdict: the tier **plus the reasons** (score, feedback count, owner, what the card
   claims) and the decision rule that applies:
   - `HIGH` → safe to proceed.
   - `MEDIUM` → proceed only if the user agrees after hearing the score.
   - `LOW` → recommend against paying this agent.
   - `UNRATED` → no feedback yet; ask the user how to proceed, and suggest a small first amount if
     they want to continue.

## Guardrails

- Read-only: never run `pay`, `identity register`, `reputation give`, `x402 pay` or escrow (`jobs`)
  commands from this workflow. Hand writes to the `agent-payer` agent, the `api-buyer` agent or the
  `identity-registrar` agent.
- Pass `--chain-id` explicitly on every command; never rely on the default.
- Report `INVALID_INPUT` / `AGENT_NOT_FOUND` as-is; don't retry unchanged.
- Never ask for, print or store private keys, mnemonics or passwords.
- Escrow-based hiring is blocked today (testnet writes are rejected by MetaMask); say so plainly
  instead of trying it.
