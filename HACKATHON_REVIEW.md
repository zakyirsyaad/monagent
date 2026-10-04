# Hackathon Review — MonAgent (Best Agent Wallet Plugin)

## Round 2 — review of `d27c6d8`

Estimated score: **~5.5 / 10** (up from 4.6). Escrow, reputation, executor shape and the x402 fallback
bug are fixed. The plugin still can't run inside `mm`, and identity commands regressed.

Still green: typecheck, plugin tests 8/8, shared tests 133/133, `forge test` 24/24. As in round 1,
these don't exercise the real host: the host's `CommandIO` type resolves to `any` in this repo (its
`@metamask/agent-sdk` type deps aren't shipped), so `const x: number = io` typechecks.

### Status of round-1 items

| Item | Status | Evidence |
|---|---|---|
| P0-1 host `PluginCommand` | ⚠️ Partial | Imported from `@metamask/agent-wallet/plugin`, but inputs don't use the host schema (R2-1) |
| P0-2 `walletExecutor` shape | ✅ Done | `await walletExecutor(io, id)` → `{ kind, chainId, transaction }` |
| P0-3 loadable packages | ❌ Open | `packages/plugin-monad/tsconfig.json` has `noEmit: true`; shared still ships raw `.ts` (R2-3) |
| Command ids `monad:*` | ✅ Done | Files moved to `src/commands/monad/…` |
| P1-1 `0x1111` fallback | ✅ Done | Failed probe now throws `FETCH_FAILED` |
| P1-2 real x402 | ❌ Open | Still custom headers + native MON transfer (R2-4) |
| P1-3 escrow self-pay | ✅ Done | Client-only release, bounty zeroed first, redeployed at `0x8dcab9dd…f6ff` |
| P1-4 on-chain `jobId` | ⚠️ Partial | Read from logs, but silently falls back to `"1"` (R2-5) |
| P2 reputation | ✅ Done | Official registry + `getClients`; `giveFeedback` passes `cast estimate` |
| P2 identity | ❌ Regressed | Old ABI against the official registry (R2-2) |
| P3 mainnet / ERC-20 / cleanup | ❌ Open | All commands hard-code 10143; 28 tracked Celo/AgentPay files (R2-6) |

### R2-1 (blocker). Every command fails on its first line
- **Where:** every `execute()` calls `io.resolveInputs<unknown>(zodSchema)`.
- **Proof:** the host's own `resolveInputs(zodSchema, { to: "0xabc", amount: "1" }, null)` throws
  `MISSING_FLAG Missing required input --undefined.`, and `schemaToFlags(zodSchema)` yields one flag named
  `undefined`.
- **Fix:** For each command, declare a host `InputSchema`
  (`{ to: { type: InputFieldType.Text, flag: "to", message: "…", required: true } }`), set
  `static flags = PluginCommand.flagsWithInputs(inputs)`, call `io.resolveInputs(inputs)`, then validate
  the resolved strings with Zod. Numbers arrive as strings (e.g. `deadlineHours`, `value`), so coerce them.
- **Also:** `io.log("…")` is `log(level, msg)` in the host, so messages are dropped. Use `io.emit(text)`.
  Throw `CommandError` instead of plain `Error` (e.g. `pay.ts` unsupported token).

### R2-2 (blocker). `identity register` / `identity get` always revert
- **Proof (testnet, official registry `0x8004A818…`):** `getAgent(1)` → `execution reverted`;
  `registerAgent(string,string,address,string)` → `execution reverted`; `register(string)` → gas 161128.
- **Fix:** `register(string agentURI)` with an ERC-8004 registration JSON (`type`, `name`, `description`,
  `services`/endpoints, …) as a `data:` URI; read the agent id from the `Registered` event. For lookup use
  `ownerOf`, `tokenURI` (decode the JSON) and `getAgentWallet`. Update the mocks so they return what the
  official registry returns, not the old contract's struct.

### R2-3 (blocker). Nothing installable from npm
- `packages/plugin-monad/tsconfig.json` has `noEmit: true`; `npm run build` emits nothing. A trial build to a
  temp dir also fails on `../shared/src/*.ts` (`Buffer`, `node:net` types) because `rootDir` pulls shared in.
- The plugin depends on `@zakyirsyaad/monagent-shared@0.1.3`, the published version, which is raw `.ts` and
  doesn't contain the new registry/escrow addresses.
- **Fix (simplest):** Move the constants + ABIs the plugin uses into `packages/plugin-monad/src/monad.ts`,
  drop the runtime dependency on shared, make `build` emit JS to `dist/`, run `oclif manifest`, bump the
  plugin version.

### R2-4. x402 still isn't x402
- Unchanged from P1-2: use `x402HTTPClient` + `registerExactEvmScheme` with a `ClientEvmSigner` backed by
  `executeSignTypedData` (already in `sdk.ts`).
- **New risk:** the body fallback reads `accepts[0].amount`, which in real x402 is USDC base units
  (`"10000"` = 0.01 USDC), then sends it as MON via `parseEther`. Only `maxSpendMon` stops a 10,000 MON
  payment. Also, real x402 uses `payTo`, not `payee`.

### R2-5. Correctness nits
- `jobs/create.ts`: on receipt failure, don't return `"1"`. Decode `JobCreated` with `parseEventLogs`
  filtered by the escrow address, and throw (or return `jobId: null` + hash) when it isn't found.
- `executeTransaction` treats `SUBMITTED` as success. Fine for `pay`, but commands that read the receipt
  need `CONFIRMED` (or must wait on the receipt themselves).

### R2-6. Mainnet, tokens, cleanup (P3, unchanged)
- `--chain-id 143|10143` with a per-chain config; escrow only on 10143 until it's deployed on mainnet.
- `pay`: implement ERC-20 (`USDC`) or stop advertising it.
- Remove `ops/`, `test/fixtures/celo-*`, `pitch-deck-…-agentpay-arc.html`, `.impeccable/`, legacy
  `packages/shared` modules and unused root deps. Untrack `tsconfig.tsbuildinfo`.

### Merge criteria for this PR

- [ ] R2-1: every command declares `static flags` and resolves inputs through the host `InputSchema`
- [ ] R2-1: a test calls the host's real `resolveInputs` / `schemaToFlags` for each command's schema
- [ ] R2-2: identity uses `register(string)` / `tokenURI` / `getAgentWallet`; mocks match the official ABI
- [ ] R2-3: `npm run build --workspace @zakyirsyaad/monagent-plugin` emits `dist/commands/monad/**.js`
- [ ] R2-3: `npm pack` tarball has no runtime import of `.ts` files
- [ ] R2-3: `mm plugins install <tarball>`, then `mm monad identity get <id> --chain-id 10143` works (paste output)
- [ ] R2-4: x402 uses `@x402/core` + `@x402/evm`; no MON fallback path
- [ ] R2-5: no hard-coded `jobId` fallback
- [ ] Typecheck, plugin tests, shared tests, `forge test` all green
- [ ] README + `skills/monad-agent/SKILL.md` show the real flags

R2-6 can land in a follow-up PR if time is short.

---

## Round 1 — review of `dd332df`

Review of `main` at `dd332df` against the Monad Metropolis track *Best Agent Wallet Plugin* (MetaMask).
The track page is behind sign-in, so the official judging criteria were not available; scoring uses
common hackathon criteria. The hackathon landing page lists **Chain ID 143 (Monad mainnet)**.

Verified locally: plugin tests 6/6 pass, `npm run typecheck` is clean, `forge test` 23/23 pass.
All of those tests run against mocks, so none of them prove the plugin loads inside the real `mm` host.

### Estimated score: 4.6 / 10

| Criterion | Score | Why |
|---|---|---|
| Track fit & MetaMask plugin integration | 3/10 | Plugin does not use the host SDK (P0-1, P0-2, P0-3) |
| Technical quality | 4/10 | Green tests, but all against self-defined mocks |
| Idea & innovation | 7/10 | ERC-8004 identity + reputation + escrow + x402 is a strong A2A story |
| Monad usage | 5/10 | Deployed contracts, but testnet only (10143) while the hackathon lists 143 |
| Completeness, demo & docs | 5/10 | README/SKILL.md/demo exist, but README claims don't match the code and the repo carries a lot of legacy |

Fixing the P0 items below should move the estimate to roughly 7–8.

---

### P0 — Plugin will not run inside `mm`

#### P0-1. `PluginCommand` is a local re-implementation, not the host class
- **Where:** `packages/plugin-monad/src/sdk.ts:41`
- **Problem:** The plugin defines its own `PluginCommand` and never imports `@metamask/agent-wallet/plugin`.
  The host (`@metamask/agent-wallet` 6.2.1) runs `assertExtendsPluginCommand()`, which checks
  `commandClass.prototype instanceof PluginCommand` and throws
  `PLUGIN_INVALID_BASE: Export a class that extends PluginCommand from @metamask/agent-wallet/plugin.`
- **Fix:** Delete `sdk.ts`. Import `PluginCommand`, `InputFieldType`, `CommandError` and the `CommandIO` type
  from `@metamask/agent-wallet/plugin`. Declare `static flags = PluginCommand.flagsWithInputs(schema)` so
  every command can run non-interactively (`mm monad pay --to … --amount …`).

#### P0-2. `walletExecutor` is called with the wrong shape
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

#### P0-3. Published packages are not loadable
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

### P1 — Security and correctness

#### P1-1. x402 pays a hard-coded address when the probe fails
- **Where:** `packages/plugin-monad/src/commands/x402/pay.ts:49-50`
- **Problem:** If `fetch` throws, `initialRes` is `null`, and the command still sends **0.01 MON to
  `0x1111…1111`** (fallback recipient and amount are hard-coded). The command can move funds without the
  server ever asking for them.
- **Fix:** No fallbacks for payee or amount. Any non-402 or unparseable response must abort before signing.

#### P1-2. x402 is not the x402 protocol
- **Problem:** Uses invented headers (`x-payment-recipient`, `x-payment-amount`, `X-Payment-Tx`) and a native MON
  transfer. Real x402 servers, including the Monad facilitator (`https://x402-facilitator.molandak.org`), will not
  understand this. `@x402/core` and `@x402/evm` are already root dependencies but unused.
- **Fix:** Use `x402HTTPClient` + `registerExactEvmScheme`. Build the `ClientEvmSigner` from the MetaMask executor:
  `signTypedData` → `exec({ kind: "typed-data", chainId, typedData })`, read `res.signature`. That way the
  EIP-3009 authorization goes through MetaMask's policy engine. Enforce `maxSpend` on the selected
  `PaymentRequirements.amount` (USDC base units), and check `network` is `eip155:143` / `eip155:10143`.
  Note: plugins don't get the wallet address from `ctx` (the host helper needs the session), so either take a
  `--payer` flag and verify it by recovering the signer from the signature, or sign a message once to learn it.

#### P1-3. Escrow: the worker can pay themselves
- **Where:** `contracts/src/MonadA2AEscrow.sol` `completeJob`
- **Problem:** `require(msg.sender == job.client || msg.sender == job.worker)` lets the worker release the
  bounty to themselves without client approval. The escrow protects nobody.
- **Fix:** Only the client releases funds (or add worker `submitResult` + client `approve`, with optional
  auto-release after a review window). Add a Foundry test showing the worker can't call it. This requires
  redeploying, then updating the address in code and README.

#### P1-4. `jobId` is invented
- **Where:** `packages/plugin-monad/src/commands/jobs/create.ts:62`
- **Problem:** `job_${Date.now()}_…` is not the on-chain ID, so agents can never reference the job again.
- **Fix:** Wait for the receipt (`publicClient.waitForTransactionReceipt`) and decode `JobCreated(jobId, …)`.
  Add `monad:jobs:complete` / `monad:jobs:refund` commands so the lifecycle is usable from the wallet.

#### P1-5. Escrow hardening
- `completeJob`/`refundExpiredJob` already set status before the external call (correct). Zeroing
  `job.bounty` before transfer and adding `nonReentrant` is cheap extra safety.

---

### P2 — ERC-8004 claims don't match the code

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

### P3 — Network, docs and cleanup

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

### Suggested order

1. P0-1 + P0-2 + P0-3 together, then the real `mm plugins install` smoke test.
2. P1-1 (fund-loss bug) and P1-3 (escrow), then redeploy the escrow.
3. P1-2 real x402 via the MetaMask typed-data signer.
4. P2 official ERC-8004 registries + README.
5. P3 mainnet support and cleanup, then record the demo.
