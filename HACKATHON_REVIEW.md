# Hackathon Review — MonAgent (Best Agent Wallet Plugin)

Review of `main` at `dd332df` against the Monad Metropolis track *Best Agent Wallet Plugin* (MetaMask).
The track page is behind sign-in, so the official judging criteria were not available; scoring uses
common hackathon criteria. The hackathon landing page lists **Chain ID 143 (Monad mainnet)**.

Verified locally: plugin tests 6/6 pass, `npm run typecheck` is clean, `forge test` 23/23 pass.
All of those tests run against mocks, so none of them prove the plugin loads inside the real `mm` host.

## Estimated score: 4.6 / 10

| Criterion | Score | Why |
|---|---|---|
| Track fit & MetaMask plugin integration | 3/10 | Plugin does not use the host SDK (P0-1, P0-2, P0-3) |
| Technical quality | 4/10 | Green tests, but all against self-defined mocks |
| Idea & innovation | 7/10 | ERC-8004 identity + reputation + escrow + x402 is a strong A2A story |
| Monad usage | 5/10 | Deployed contracts, but testnet only (10143) while the hackathon lists 143 |
| Completeness, demo & docs | 5/10 | README/SKILL.md/demo exist, but README claims don't match the code and the repo carries a lot of legacy |

Fixing the P0 items below should move the estimate to roughly 7–8.

---

## P0 — Plugin will not run inside `mm`

### P0-1. `PluginCommand` is a local re-implementation, not the host class
- **Where:** `packages/plugin-monad/src/sdk.ts:41`
- **Problem:** The plugin defines its own `PluginCommand` and never imports `@metamask/agent-wallet/plugin`.
  The host (`@metamask/agent-wallet` 6.2.1) runs `assertExtendsPluginCommand()`, which checks
  `commandClass.prototype instanceof PluginCommand` and throws
  `PLUGIN_INVALID_BASE: Export a class that extends PluginCommand from @metamask/agent-wallet/plugin.`
- **Fix:** Delete `sdk.ts`. Import `PluginCommand`, `InputFieldType`, `CommandError` and the `CommandIO` type
  from `@metamask/agent-wallet/plugin`. Declare `static flags = PluginCommand.flagsWithInputs(schema)` so
  every command can run non-interactively (`mm monad pay --to … --amount …`).

### P0-2. `walletExecutor` is called with the wrong shape
- **Where:** every write command (`pay.ts`, `identity/register.ts`, `reputation/give.ts`, `x402/pay.ts`, `jobs/create.ts`)
- **Problem:** In the host, `walletExecutor(io, source)` returns `Promise<EvmWalletExecutor>`, and the request is
  `{ kind: "transaction", chainId, transaction: { to, value, data } }`. The result is
  `{ kind, hash | signature, status: "CONFIRMED" | "FAILED" | …, failureDescription, pendingJob }`.
  The plugin calls it synchronously, puts `to`/`value` at the top level, and checks `status === "success"`.
  The mock in `commands.test.ts` copies the same wrong shape, which is why tests pass.
- **Fix:** Follow the built-in `wallet send-transaction` pattern:
  ```ts
  const exec = await this.ctx.walletExecutor(io, "monad:pay");
  const res = await exec(
    { kind: "transaction", chainId, transaction: { to, value } },
    { signal: io.signal },
  );
  if (res.status !== "CONFIRMED" || !res.hash) throw new CommandError(/* … */);
  ```
  Keep the command classes thin and move logic into pure functions, so tests can inject a fake executor
  without having to construct the oclif command.

### P0-3. Published packages are not loadable
- **`@zakyirsyaad/monagent-shared` ships raw `.ts`.** Its `exports` point to `./src/index.ts`. Node refuses type
  stripping for files under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so the plugin
  crashes on import once installed from npm. Either compile `shared` to JS, or (simpler) move the Monad
  constants and ABIs the plugin needs into the plugin itself and drop the runtime dependency.
- **The plugin build doesn't emit.** The `build` script is `tsc -p ../../tsconfig.json --noEmit`; the local
  `dist/` (untracked) was produced some other way, so a fresh `npm pack` may ship stale or missing JS. Make `build` emit with `packages/plugin-monad/tsconfig.json`, and
  regenerate `oclif.manifest.json` from the build (`oclif manifest`).
- **Command IDs vs file layout (verify):** oclif derives IDs from paths, so `dist/commands/pay.js` becomes `pay`,
  but the manifest and `mm.commands[].id` say `monad:pay`. Move the files under `src/commands/monad/…` so
  path, manifest and `pluginCommandId` all agree.
- **Acceptance test:** `mm plugins install` from a packed tarball, then run every command once on testnet.
  Record that for the demo video.

---

## P1 — Security and correctness

### P1-1. x402 pays a hard-coded address when the probe fails
- **Where:** `packages/plugin-monad/src/commands/x402/pay.ts:49-50`
- **Problem:** If `fetch` throws, `initialRes` is `null`, and the command still sends **0.01 MON to
  `0x1111…1111`** (fallback recipient and amount are hard-coded). The command can move funds without the
  server ever asking for them.
- **Fix:** No fallbacks for payee or amount. Any non-402 or unparseable response must abort before signing.

### P1-2. x402 is not the x402 protocol
- **Problem:** Uses invented headers (`x-payment-recipient`, `x-payment-amount`, `X-Payment-Tx`) and a native MON
  transfer. Real x402 servers, including the Monad facilitator (`https://x402-facilitator.molandak.org`), will not
  understand this. `@x402/core` and `@x402/evm` are already root dependencies but unused.
- **Fix:** Use `x402HTTPClient` + `registerExactEvmScheme`. Build the `ClientEvmSigner` from the MetaMask executor:
  `signTypedData` → `exec({ kind: "typed-data", chainId, typedData })`, read `res.signature`. That way the
  EIP-3009 authorization goes through MetaMask's policy engine. Enforce `maxSpend` on the selected
  `PaymentRequirements.amount` (USDC base units), and check `network` is `eip155:143` / `eip155:10143`.
  Note: plugins don't get the wallet address from `ctx` (the host helper needs the session), so either take a
  `--payer` flag and verify it by recovering the signer from the signature, or sign a message once to learn it.

### P1-3. Escrow: the worker can pay themselves
- **Where:** `contracts/src/MonadA2AEscrow.sol` `completeJob`
- **Problem:** `require(msg.sender == job.client || msg.sender == job.worker)` lets the worker release the
  bounty to themselves without client approval. The escrow protects nobody.
- **Fix:** Only the client releases funds (or add worker `submitResult` + client `approve`, with optional
  auto-release after a review window). Add a Foundry test showing the worker can't call it. This requires
  redeploying, then updating the address in code and README.

### P1-4. `jobId` is invented
- **Where:** `packages/plugin-monad/src/commands/jobs/create.ts:62`
- **Problem:** `job_${Date.now()}_…` is not the on-chain ID, so agents can never reference the job again.
- **Fix:** Wait for the receipt (`publicClient.waitForTransactionReceipt`) and decode `JobCreated(jobId, …)`.
  Add `monad:jobs:complete` / `monad:jobs:refund` commands so the lifecycle is usable from the wallet.

### P1-5. Escrow hardening
- `completeJob`/`refundExpiredJob` already set status before the external call (correct). Zeroing
  `job.bounty` before transfer and adding `nonReentrant` is cheap extra safety.

---

## P2 — ERC-8004 claims don't match the code

Verified with `eth_getCode` / `cast call` on both public RPCs (2026-10-04):

| Contract | Monad testnet (10143) | Monad mainnet (143) |
|---|---|---|
| Official ERC-8004 Identity (`AgentIdentity`, v2.0.0) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Official ERC-8004 Reputation (v2.0.0) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| MonadAgentRegistry (this repo) | `0x3a933f9d5e2ee210c9690c803c4d24cd6dd28e51` | not deployed |
| MonadA2AEscrow (this repo) | `0x31665c49a8e0565f3e496080a08f089d29bbcaae` | not deployed |

- **README** says the plugin uses the official registries at `0x8004A169…`/`0x8004BAa1…`. Those are the
  **mainnet** addresses, and the code actually targets the repo's own `MonadAgentRegistry` on testnet.
- **`MonadAgentRegistry` is not ERC-8004:** not ERC-721, no `tokenURI`/agent registration file, no Validation
  Registry, one contract plays both roles.
- **Self-feedback allowed:** the agent owner can rate their own agent, so reputation is trivially gamed.
- **`getSummary` ignores its filter arguments.** The official registry instead reverts with
  `clientAddresses required` when the list is empty (anti-Sybil). `reputation:check` passes `[]`, so it will
  fail against the official registry. Fetch `getClients(agentId)` first (or let the caller pass trusted
  clients) and pass them in.
- **Recommended fix:** Point `identity:*` and `reputation:*` at the official registries per chain.
  Identity: `register(string agentURI)` with an ERC-8004 registration JSON (`type`, `name`, `description`,
  `services`, …), read the `Registered` event for the ID, and use `tokenURI` + `getAgentWallet` for lookup.
  Keep the repo's own contracts for escrow only, and make the README match.

---

## P3 — Network, docs and cleanup

- **Mainnet:** Support `--chain-id 143` (default if the track requires mainnet) alongside 10143. Keep a
  per-chain config (registries, escrow, USDC, explorer), and fail clearly when a feature (like escrow) isn't
  deployed on the selected chain. Update `mm.commands[].targetChains`.
- **`monad:pay` with tokens:** It advertises ERC-20 support, then rejects anything but MON. Implement ERC-20
  `transfer` (USDC at least, with decimals) or remove the claim.
- **Legacy code from a previous project:** `ops/` (Celo mainnet manifests, nginx/systemd for "agentpay-celo"),
  `test/fixtures/celo-mainnet.shadow.json`, `pitch-deck-20260810-agentpay-arc.html`,
  `.impeccable/critique/…agentpay-deck.md`, and most of `packages/shared` (X Layer/Arc/Base chains, Circle,
  Celo attribution, Supabase auth). Root `package.json` still depends on `@celo/attribution-tags`,
  `@supabase/supabase-js`, `ethers`. Judges reading the repo may see this as a recycled project. Remove what
  isn't Monad.
- **Committed build output:** `packages/plugin-monad/tsconfig.tsbuildinfo` shouldn't be tracked; add it to `.gitignore`.
- **README:** The "Interactive End-to-End Demo" section has npm commands outside the code fence.
  Add an architecture diagram, a 2-minute "install → register → pay → rate" walkthrough, and explorer links to
  real transactions.
- **`skills/monad-agent/SKILL.md`:** Update after the command/flag changes so agents call the real flags.

---

## Suggested order

1. P0-1 + P0-2 + P0-3 together, then the real `mm plugins install` smoke test.
2. P1-1 (fund-loss bug) and P1-3 (escrow), then redeploy the escrow.
3. P1-2 real x402 via the MetaMask typed-data signer.
4. P2 official ERC-8004 registries + README.
5. P3 mainnet support and cleanup, then record the demo.
