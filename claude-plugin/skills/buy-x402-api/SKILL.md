---
name: buy-x402-api
description: Use when calling a paid HTTP API that answers with 402 Payment Required (x402 protocol) on Monad. Confirms the spend cap and payer address with the user, pays the per-call USDC price through the MetaMask Agent Wallet, and returns the API response with the settled payment details. Requires explicit confirmation of maxSpend and payer before anything is signed.
---

# Buy a paid API call (x402)

Pays a per-call HTTP 402 price on Monad. The plugin checks the server's payment requirement,
enforces the spend cap and verifies the payer signature before anything is sent. Command syntax and
error codes are in the shared `monad-agent` skill.

## Procedure

1. **Confirm the terms with the user** and wait for an explicit yes:
   - the URL and HTTP method (plus a body for `POST`);
   - the spend cap `--maxSpend` in token base units (USDC: `1000000` = 1 USDC);
   - the `--payer` address — it must be the address `mm` is signed in with, otherwise the call
     aborts with `PAYER_MISMATCH` and nothing is sent.
2. **Buy the call**:
   ```bash
   mm monad x402 pay --url <https url> --method POST --body '{"q":"…"}' \
     --maxSpend <base units> --payer <mm wallet address> --chain-id 143 --json
   ```
3. **Report** the API's `statusCode` and `response`, whether `paymentSettled`, and the
   `paymentDetails` that were paid.

## Failure handling

- `MAX_SPEND_EXCEEDED` → the server asks more than the cap; ask the user before raising it.
- `PAYER_MISMATCH` → `--payer` isn't the signing wallet; fix it — nothing was sent.
- `UNSUPPORTED_PAYMENT_NETWORK` → no `exact` requirement on the chosen chain; try the other chain
  only if the user allows it.
- `FETCH_FAILED` → the URL was unreachable; nothing was paid.
- On `[AWAITING_MFA]`, stop and tell the user what to approve; never resubmit.

## Guardrails

- Pass `--chain-id` explicitly: `143` spends real USDC; testnet writes are currently rejected by
  MetaMask, so never fall back to `10143` for a payment.
- Never retry a write that errored or timed out; check `mm wallet requests list` first.
- Never ask for, print or store private keys, mnemonics or passwords.
