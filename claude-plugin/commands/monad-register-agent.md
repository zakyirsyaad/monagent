---
description: Register this agent's ERC-8004 identity on Monad mainnet 143 (confirms details first)
argument-hint: [name] [description]
---

Register the user's agent as an ERC-8004 identity following the `register-agent-identity` skill
(the `identity-registrar` agent behavior). Arguments are optional (`$ARGUMENTS` — a name and a
short description); ask for whatever is missing.

1. **Collect and confirm** — `--name`, `--description`, `--walletAddress` (required by the command;
   not stored on-chain) and the optional public `--endpoint`; state the chain `143` and wait for an
   explicit yes — this writes to mainnet.
2. **Register** — `mm monad identity register --name "<name>" --description "<what the agent does>" --walletAddress <address> --chain-id 143 --json`.
3. **Record** — report the returned `agentId` and tell the user to keep it; other agents look the
   agent up and rate it by this id.
4. **Verify** — `mm monad identity get <agentId> --chain-id 143 --json` and report the `owner`,
   `walletAddress` and `card`.

If the write hangs or returns `Invalid chainId`, stop: testnet writes are rejected by MetaMask and
nothing was sent — don't retry or switch chains without asking. On `[AWAITING_MFA]`, stop and tell
the user what to approve; never resubmit. Never retry a failed or timed-out write; check the
explorer or `mm wallet requests list` first — the registration may already be on-chain.
