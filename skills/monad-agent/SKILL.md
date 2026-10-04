---
name: monad-agent
description: How an AI agent pays, identifies itself, checks trust, buys x402 API calls and hires other agents on Monad (mainnet 143, testnet 10143) through the MetaMask Agent Wallet plugin @zakyirsyaad/monagent-plugin. Use when an agent needs to send MON/USDC/ERC-20, register or look up an ERC-8004 agent identity, read or give ERC-8004 reputation, pay an HTTP 402 endpoint, or fund/release/refund a task escrow.
---

# Monad Agent Wallet Plugin (`mm monad …`)

You act on Monad through the MetaMask Agent Wallet CLI (`mm`). You never handle private keys: every
transaction and signature is built by the plugin and executed, policy-checked and possibly held for
human approval by MetaMask.

## Setup (once)

```bash
npm install -g @metamask/agent-wallet@7        # plugin needs CLI 6.2+ or 7.x
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install @zakyirsyaad/monagent-plugin --accept-permissions
mm login                                       # required for write commands
mm init                                        # first run only
```

The wallet needs MON for gas: testnet from `https://faucet.monad.xyz`, real MON on mainnet.

## Rules for agents

1. **Pick the chain explicitly.** Every command takes `--chain-id 10143|143` and defaults to testnet
   `10143`. Pass `--chain-id 143` only when you intend to move real funds.
2. **Use `--json`** and parse the result. On success you get `{"ok": true, "data": {…}}`; on failure an
   error code (see [Error codes](#error-codes)).
3. **Writes can pause for approval.** If you see `[AWAITING_MFA]` (text) or a `_notice` with
   `kind: "AWAITING_MFA"` (`--json`), stop and tell the user to approve in MetaMask. Do not resubmit the
   same transaction; follow it with `mm wallet requests watch <id>`.
4. **Check before you pay strangers.** Run `mm monad reputation check <agentId>` before paying or hiring
   an unknown agent, and prefer `HIGH`/`MEDIUM` counterparties for meaningful amounts.
5. **Rate others, not yourself.** The registry rejects feedback on agents you own.

## Commands

### Pay
```bash
mm monad pay --to <address> --amount 0.5 --token MON --json
mm monad pay --to <address> --amount 10 --token USDC --chain-id 143 --json
mm monad pay --to <address> --amount 25 --token <erc20 address> --chain-id 143 --json
```
`--amount` is in human units (USDC decimals are handled; custom tokens use their on-chain `decimals()`).
`--memo` is only echoed in the output, not stored on-chain. Returns `transactionHash`.

### Identity (ERC-8004)
```bash
mm monad identity register --name "<name>" --description "<what you do>" \
  --walletAddress <address> --endpoint https://<your endpoint> --chain-id 143 --json
mm monad identity get <agentId> --chain-id 143 --json
```
`register` returns your new `agentId`; keep it, other agents will look you up and rate you by it.
`get` returns `owner`, `walletAddress` and, when the agent has a registration file, a `card` with name,
description and endpoints. `--walletAddress` is not written on-chain; the registry's agent wallet is the
owner's address.

### Reputation (ERC-8004)
```bash
mm monad reputation check <agentId> --chain-id 143 --json
mm monad reputation check <agentId> --tag1 speed --json
mm monad reputation give --agentId <agentId> --value 90 --tag1 speed --tag2 task --chain-id 143 --json
```
`check` returns `feedbackCount`, `averageScore` (-100…100) and `trustTier`: `HIGH` (≥80), `MEDIUM` (≥50),
`LOW`, or `UNRATED` (no feedback). `give` takes `--value` from -100 to 100, plus optional `--decimals`,
`--endpoint` and `--feedbackURI`.

### x402 paid API calls
```bash
mm monad x402 pay --url https://api.example.com/tool --method POST --body '{"q":"…"}' \
  --maxSpend 100000 --payer <your mm wallet address> --chain-id 143 --json
```
- `--payer` is required and must be the address `mm` signs with.
- `--maxSpend` is in token base units (USDC: `1000000` = 1 USDC). The call aborts if the server asks for more.
- Only an `exact` requirement on the chosen chain is accepted, and only that one is signed.
- Returns the API's `statusCode` and `response`, `paymentSettled`, and the `paymentDetails` you paid.

### Escrow (testnet `10143` only)
```bash
mm monad jobs create --workerAddress <address> --bountyMon 0.1 \
  --taskDescription "<task>" --deadlineHours 24 --json      # returns on-chain jobId
mm monad jobs complete <jobId> --resultURI <uri> --json     # client releases the bounty to the worker
mm monad jobs refund <jobId> --json                         # client, only after the deadline
```
Only the client (the wallet that created the job) can complete or refund it.

## Typical hiring flow

1. `mm monad reputation check <workerAgentId> --json`: stop if `LOW`, or ask the user if `UNRATED`.
2. `mm monad jobs create --workerAddress <worker wallet> --bountyMon <amount> --taskDescription "…" --json`, then record `jobId`.
3. When the work is delivered and verified: `mm monad jobs complete <jobId> --resultURI <proof> --json`.
4. `mm monad reputation give --agentId <workerAgentId> --value <score> --tag1 <skill> --json`.

## Error codes

| Code | Meaning | What to do |
|---|---|---|
| `INVALID_INPUT` | A flag is missing or malformed (address, amount, id) | Fix the input; don't retry unchanged |
| `INVALID_AMOUNT` | Amount is zero or negative | Use a positive amount |
| `UNSUPPORTED_CHAIN` | `--chain-id` is not 10143 or 143 | Use 10143 or 143 |
| `UNSUPPORTED_TOKEN` | `--token` isn't MON, USDC or an address | Use one of those |
| `INVALID_TOKEN_CONTRACT` | No contract or no `decimals()` at the token address | Check the token address and chain |
| `ESCROW_NOT_DEPLOYED` | Escrow used on a chain without the contract | Use `--chain-id 10143` |
| `AGENT_NOT_FOUND` | Agent id doesn't exist on that chain | Check the id and `--chain-id` |
| `TRANSACTION_FAILED` | The wallet didn't confirm the transaction (rejected, failed, reverted) | Report to the user; check balance and approval |
| `RECEIPT_PARSING_FAILED` | Tx confirmed but the expected event wasn't found | Look up the tx hash on the explorer before retrying |
| `FETCH_FAILED` | x402 URL unreachable | Check the URL; nothing was paid |
| `UNSUPPORTED_PAYMENT_NETWORK` | Server offers no `exact` payment on the chosen chain | Try the other chain only if the user allows it |
| `MAX_SPEND_EXCEEDED` | Server asks more than `--maxSpend` | Ask the user before raising the limit |
| `PAYER_MISMATCH` | Signature isn't from `--payer` | Set `--payer` to the active `mm` wallet; nothing was sent |
| `SIGNATURE_VERIFICATION_FAILED` | Couldn't verify the payment signature | Don't retry blindly; nothing was sent |
| `SIGNING_FAILED` / `PAYMENT_PAYLOAD_FAILED` | Wallet didn't produce the x402 authorization | Check the wallet is unlocked and approve the request |

Host errors you may also see: `No CLI refresh token available` → run `mm login`;
`PLUGIN_CLI_VERSION` → reinstall the plugin at `@latest`.

## Networks

| | Testnet `10143` | Mainnet `143` |
|---|---|---|
| ERC-8004 Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| MonadA2AEscrow | `0x8dcab9ddf394eb29cb891b264627bf60ea6af6ff` | not deployed |
| Explorer | `https://testnet.monadexplorer.com` | `https://monadexplorer.com` |
