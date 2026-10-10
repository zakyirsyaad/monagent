---
description: Vet then pay a Monad agent in MON/USDC/ERC-20 on mainnet 143 (real funds; asks before sending)
argument-hint: <agentId> <amount> <token>
---

Pay the Monad agent with id $1 the amount $2 in token $3 (`MON`, `USDC` or an ERC-20 address),
following the `pay-vetted-agent` skill (the `agent-payer` agent behavior). This moves real funds on
mainnet — nothing is sent without the user's explicit yes.

1. **Vet** — `mm monad identity get <agentId> --chain-id 143 --json` (the recipient's wallet is in
   the result) and `mm monad reputation check <agentId> --chain-id 143 --json`; apply the tier rule:
   `LOW` or `UNKNOWN` stop; `UNRATED` and `MEDIUM` ask the user.
2. **Confirm** — state the chain `143`, recipient wallet address, amount and token, and wait for an
   explicit yes.
3. **Pay** — `mm monad pay --to <agent wallet> --amount <amount> --token <token> --chain-id 143 --json`.
4. **Report** — the `transactionHash` and `https://monadexplorer.com/tx/<hash>`; once the work is
   delivered, offer `mm monad reputation give --agentId <agentId> --value <score> --chain-id 143 --json`
   (users can't rate their own agent).

If a write hangs or returns `Invalid chainId`, stop: testnet writes are rejected by MetaMask and
nothing was sent — don't retry or switch chains without asking. On `[AWAITING_MFA]`, stop and tell
the user what to approve; never resubmit. Never retry a failed or timed-out write; check the
explorer or `mm wallet requests list` first.
