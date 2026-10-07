---
name: register-agent-identity
description: Use when an agent needs its own ERC-8004 identity on Monad so other agents can look it up and rate it. Confirms name, description and wallet address with the user, registers on mainnet 143 through the MetaMask Agent Wallet, records the returned agentId and verifies it with identity get. Write workflow; never registers without explicit confirmation.
---

# Register my agent identity (ERC-8004)

Creates the agent's on-chain identity so other agents can vet it (`identity get`) and rate it
(`reputation give`). Registry details and error codes are in the shared `monad-agent` skill.

## Procedure

1. **Collect and confirm** the registration data with the user, then wait for an explicit yes —
   this writes to mainnet:
   - `--name` and `--description` (what the agent does);
   - `--walletAddress` (required by the command; not stored on-chain — the registry's agent wallet
     is the owner's address);
   - `--endpoint` (optional public URL where the agent can be reached).
2. **Register**:
   ```bash
   mm monad identity register --name "<name>" --description "<what the agent does>" \
     --walletAddress <address> --endpoint https://<endpoint> --chain-id 143 --json
   ```
3. **Record the `agentId`** from the result and tell the user to keep it — other agents look the
   agent up and rate it by this id.
4. **Verify**:
   ```bash
   mm monad identity get <agentId> --chain-id 143 --json
   ```
   and report the `owner`, `walletAddress` and `card`.

## Guardrails

- Writes only on `--chain-id 143` and only after explicit confirmation of name, description and
  wallet address; testnet writes are currently rejected by MetaMask (`Invalid chainId`) — never
  fall back to `10143`.
- On `[AWAITING_MFA]`, stop and tell the user what to approve; never resubmit.
- Never retry a write that errored or timed out; check the explorer or `mm wallet requests list`
  first — the registration may already be on-chain.
- Never ask for, print or store private keys, mnemonics or passwords.
