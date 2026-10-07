---
description: Buy one paid HTTP API call with x402 on Monad (confirms spend cap and payer first)
argument-hint: <url>
---

Buy a paid API call at $1 following the `buy-x402-api` skill (the `api-buyer` agent behavior). The
endpoint must speak x402 (answer `402 Payment Required` with a payment requirement).

Arguments: `$ARGUMENTS` — the API URL.

1. **Confirm the terms** and wait for an explicit yes: the URL and HTTP method (plus body for
   `POST`), the spend cap `--maxSpend` in token base units (USDC `1000000` = 1 USDC), and the
   `--payer` address — it must be the address `mm` is signed in with.
2. **Buy** — `mm monad x402 pay --url <url> --method <GET|POST> --maxSpend <cap> --payer <address> --chain-id 143 --json`.
3. **Report** — the API's `statusCode` and `response`, whether `paymentSettled`, and the
   `paymentDetails` that were paid.

Failure handling: `MAX_SPEND_EXCEEDED` — ask the user before raising the cap; `PAYER_MISMATCH` —
fix `--payer`, nothing was sent; `UNSUPPORTED_PAYMENT_NETWORK` — try the other chain only if the
user allows it; `FETCH_FAILED` — nothing was paid. On `[AWAITING_MFA]`, stop and tell the user what
to approve; never resubmit. Never retry a failed or timed-out write blindly.
