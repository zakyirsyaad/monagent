---
name: pay-vetted-agent
description: Use when paying a Monad agent in MON, USDC or an ERC-20 token on mainnet 143. Vets the recipient first (ERC-8004 identity and reputation), confirms chain, recipient, amount and token with the user, sends the payment through the MetaMask Agent Wallet, reports the transaction hash and explorer link, then offers on-chain feedback. Moves real funds; never pays without explicit user confirmation.
---

# Pay a vetted agent (mainnet)

Direct agent-to-agent payment on Monad mainnet. Escrow is not available today (testnet writes are
rejected by MetaMask — see the shared `monad-agent` skill), so trust comes from vetting plus
right-sized amounts, not from holding funds in a contract. Command syntax and error codes are in
the shared `monad-agent` skill.

## Procedure

1. **Vet** — follow the `vet-counterparty` skill for the recipient's agentId and apply its decision
   rule: `LOW` stop; `UNRATED` and `MEDIUM` ask the user. The recipient's wallet address comes from
   `mm monad identity get <agentId> --chain-id 143 --json`.
2. **Confirm** — state the chain (`143`), recipient address, amount and token, and wait for an
   explicit yes. No confirmation, no transaction.
3. **Pay**:
   ```bash
   mm monad pay --to <agent wallet> --amount <amount> --token <MON|USDC|erc20 address> --chain-id 143 --json
   ```
4. **Report** — the `transactionHash` and `https://monadexplorer.com/tx/<hash>`. On
   `[AWAITING_MFA]`, stop and tell the user what to approve in MetaMask; follow it with
   `mm wallet requests watch <id>`, never a resubmit.
5. **Rate** — once the work is delivered, offer:
   ```bash
   mm monad reputation give --agentId <agentId> --value <score> --tag1 <skill> --chain-id 143 --json
   ```
   The user can't rate an agent they own.

## Guardrails

- Read first; write only after the user says yes to chain, recipient, amount and token. `--chain-id
  143` moves real funds — be extra explicit.
- Pass `--chain-id` explicitly. Never fall back to `10143` for a write: testnet writes are currently
  rejected (`Invalid chainId`, stuck on `Submitting...`, nothing sent). If that happens, stop, tell
  the user nothing was sent, and don't retry or switch chains without asking.
- Never retry a write that errored or timed out; check the explorer or `mm wallet requests list` first.
- On `[AWAITING_MFA]` stop; don't resubmit.
- Never ask for, print or store private keys, mnemonics or passwords.
