---
description: Vet a Monad agent (read-only) — ERC-8004 identity + reputation + trust verdict
argument-hint: <agentId> [chainId]
---

Vet the Monad agent with id $1 following the `vet-counterparty` skill. This command is read-only:
it never sends a transaction.

Arguments: `$ARGUMENTS` — first the agentId, then optionally a chainId (`143` mainnet, default;
`10143` testnet). Reads work on both chains.

1. `mm monad identity get <agentId> --chain-id <chainId> --json` — record `owner`, `walletAddress`
   and the `card` if present.
2. `mm monad reputation check <agentId> --chain-id <chainId> --json` — record `feedbackCount`,
   `averageScore` and `trustTier`.
3. Report the verdict: the tier plus the reasons, and its decision rule — `HIGH` proceed; `MEDIUM`
   proceed only if the user agrees; `LOW` recommend against; `UNRATED` ask the user; `UNKNOWN` stop (vetting failed).

On `AGENT_NOT_FOUND`, check the id and chain; don't retry unchanged. For any write (paying,
rating, registering), hand off to the `agent-payer` agent, the `api-buyer` agent or the
`identity-registrar` agent — never from this command.
