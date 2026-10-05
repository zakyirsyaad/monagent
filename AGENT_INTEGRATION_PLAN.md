# Agent harness integration: scope

Working scope for making MonAgent usable by agentic harnesses (Claude Code, Codex, and other
MCP-capable clients). **This file is only the brief for this PR. Delete it before merging** (see the
checklist at the end).

Baseline: `main` at `363e8ef`, plugin `@zakyirsyaad/monagent-plugin@0.1.5`.

## Where we are

A harness with shell access can already run `mm monad ...` today:
- every option is a CLI flag; `--json` returns `{"ok": true, "data": ...}`;
- `skills/monad-agent/SKILL.md` documents rules, flows and error codes for agents.

What is missing:
1. **The skill doesn't travel with the plugin.** The npm package ships only `dist`, the manifest and
   the README (`files` in `packages/plugin-monad/package.json`), so `mm plugins install` never brings
   `SKILL.md`. An agent only learns the rules if someone copies the file by hand.
2. **No one-step install for Claude Code.** There is no `.claude-plugin/` manifest or marketplace entry.
3. **No MCP server.** Harnesses that only speak MCP can't use MonAgent at all.

Constraints that apply to all three:
- Writes need a human: `mm login` and `mm init` once, and writes can stop at `[AWAITING_MFA]` for
  approval in MetaMask. Don't try to bypass this; document it.
- MetaMask's executor rejects writes on Monad testnet (`10143`): the gateway answers
  `Invalid chainId`, nothing is sent. Only mainnet (`143`) writes work through `mm`. Reads work on both.
- `scripts/repository-contents.test.mjs` fails if `AGENTS.md` or anything under `docs/` is tracked.
  Don't add either unless you change that test on purpose and say why in the PR.
- Node `>=22`, workspaces are `packages/*`, and `npm run typecheck` only covers what root
  `tsconfig.json` includes (today `packages/plugin-monad/src/**` and `scripts/**`).

## Task A. Ship the skill with the plugin

Goal: after `mm plugins install @zakyirsyaad/monagent-plugin`, an agent can get the skill with one command.

- Make the tarball contain the skill. Keep **one source of truth** (`skills/monad-agent/SKILL.md`) and
  copy it into the package during `build`, or move it under the package and point the repo path at it.
  Add the folder to `files`. Do not use `postinstall` scripts.
- Add a `mm monad skill` command (new file under `src/commands/monad/`), with a host `InputSchema` and
  `static flags` like the other commands:
  - default: print the skill to stdout;
  - `--install <target>`: write it to the right place for `claude-project` (`.claude/skills/monad-agent/`),
    `claude-user` (`~/.claude/skills/monad-agent/`) and the agents/Codex location. **Verify the Codex
    and generic-agents skill paths against their current docs** before hardcoding them;
  - never overwrite an existing file without `--force`; resolve and validate the target path (no `..`
    escapes); print exactly where it wrote.
- Command id and manifest: `monad:skill`, capabilities `[]`; check what the manifest schema allows for
  `targetChains` on a command that doesn't touch a chain. Bump the plugin to `0.2.0` (new command).
- Docs: README "Use with an AI agent" section, SKILL.md note on how it gets installed.

## Task B. Claude Code plugin and marketplace entry

Goal: a user can add this repo as a marketplace and install MonAgent in two commands.

- Layout (suggested, adjust if the current Claude Code docs say otherwise):
  ```
  .claude-plugin/marketplace.json        # lists the plugin, source "./claude-plugin"
  claude-plugin/.claude-plugin/plugin.json
  claude-plugin/skills/monad-agent/SKILL.md   # generated copy, not hand-edited
  claude-plugin/.mcp.json                     # added once Task C is published
  ```
- `plugin.json`: `name`, `description`, `version` (keep it equal to the npm plugin version), `author`.
- The skill copy must be generated from the single source in Task A, and a test must fail if they differ.
- The skill's setup section already tells the agent to install `mm` and the plugin; keep it accurate.
- Validate it for real: install it from a local path in Claude Code (`--plugin-dir` or
  `/plugin marketplace add <path>`; check the exact commands for your version), confirm the skill is
  listed and loads, and paste what you saw in the PR.
- README: the exact two install commands, and a line saying login/MFA are still manual.

## Task C. MCP server

Goal: any MCP client can call MonAgent through typed tools. Suggested package
`packages/mcp-monad`, name `@zakyirsyaad/monagent-mcp`, bin `monagent-mcp`, stdio transport, built on
`@modelcontextprotocol/sdk` (latest on npm is `1.32.0`, Node `>=18`).

Design:
- The server holds **no keys and no wallet logic**. Each tool builds an argument list and runs the
  local `mm` CLI with `--json`, so MetaMask's policy engine and approvals stay in the loop.
- One tool per command (9): pay, identity register/get, reputation check/give, x402 pay, jobs
  create/complete/refund. Names like `monad_pay`. Describe each tool for a model (when to use it,
  units, what comes back). Set MCP annotations: `readOnlyHint: true` for `identity get` and
  `reputation check`; mark the rest as writes, and `destructiveHint` where funds move.
- Validate every input with zod (addresses, amounts, ids, chain ids) before building arguments.
- **Chain handling for writes:** require `chainId` explicitly instead of defaulting, so a model
  can't silently pick testnet and get a confusing failure. Decide, and document the decision.
- Output: return the parsed `data` as structured content plus a short text summary; surface the
  explorer link for writes.

Safety requirements (reviewed closely):
- Use `execFile`/`spawn` with an **argument array and no shell**. A value like `0x..; rm -rf ~` must
  be rejected by validation, and where free text is allowed (`memo`, `taskDescription`,
  `body`) it must reach `mm` as one literal argument.
- Only ever run `mm monad <subcommand>` from a fixed allowlist; never pass through arbitrary
  arguments, and never forward environment variables you don't need.
- **Never retry a write automatically.** A timeout or error on a write may still have sent the
  transaction. Return the error and the code, and let the caller decide after checking the chain.
- Timeouts: reads short, writes long enough for a human to approve. If `mm` is waiting on approval
  (`AWAITING_MFA` notice), return that state clearly (what to approve, where) instead of failing.
- Map plugin error codes (`UNSUPPORTED_CHAIN`, `ESCROW_NOT_DEPLOYED`, `PAYER_MISMATCH`, ...) to
  `isError` results that keep the code, so the model can follow the table in SKILL.md.
- Startup check: find `mm` (`PATH` or an env override), check its version is 6.2+/7.x, and fail
  with a clear message if it or the plugin is missing. Verify how to detect an installed plugin
  with `mm plugins` before relying on a specific command.
- Cap output size; never log secrets or full environments.

Tests (no real chain or wallet needed):
- Use a stub `mm` executable (a small script) to check argument building, JSON parsing, error and
  timeout mapping, and that injection strings never reach a shell.
- Start the server over stdio with the SDK's client and assert `tools/list` (9 tools, annotations,
  schemas) and one read and one write call end to end against the stub.
- Wire the package into root `tsconfig.json` and make sure `npm test` and `npm run typecheck` run it.

Docs: README section with client setup, for example `claude mcp add monagent -- npx -y
@zakyirsyaad/monagent-mcp` for Claude Code, and config snippets for Codex and other clients (verify
each against the client's docs). State clearly that login, `mm init` and MetaMask approvals are
still done by a person on the same machine.

Out of scope: a hosted or HTTP MCP server, OAuth, anything that holds keys, and testnet writes
(blocked by MetaMask).

## Order and releases

1. Task A first (smallest, and B reuses the skill).
2. Task C is independent. Task B's `.mcp.json` depends on C being published.
3. Suggested: one commit per task so review stays small.
4. Release: plugin `0.2.0`, MCP server `0.1.0`. Publish the MCP package first, then wire it
   into the Claude plugin.

## Merge checklist

Task A
- [ ] The `npm pack --dry-run` file list of the plugin includes the skill; a test asserts it
- [ ] `mm monad skill` prints the skill; `--install` writes it, refuses to overwrite without `--force`, and rejects paths that escape the target (tests)
- [ ] No `postinstall` script; Codex/agents paths verified against docs (link them in the PR)
- [ ] Manifest regenerated; plugin version `0.2.0`; the host `resolveInputs` schema test covers the new command

Task B
- [ ] `.claude-plugin/marketplace.json` and `plugin.json` parse and have required fields; plugin version equals the npm plugin version (test)
- [ ] The plugin's skill is identical to the source skill (test)
- [ ] Installed from a local path in Claude Code; the skill shows up and loads (paste the evidence)

Task C
- [ ] 9 tools with zod schemas, descriptions and read/write annotations; `tools/list` test
- [ ] Runs `mm` without a shell; an injection-string test passes; the command allowlist is enforced
- [ ] No automatic retry on writes; timeout and `AWAITING_MFA` handling tested
- [ ] Plugin error codes preserved in `isError` results (test)
- [ ] Startup check for a missing or too-old `mm`; clear message (test)
- [ ] Typecheck and `npm test` include the new package; `bin` works via `npx` from a packed tarball (paste the output)

All
- [ ] Typecheck, plugin tests, `repository-contents`, `forge test` green; no `AGENTS.md` or `docs/` added
- [ ] README, `SKILL.md` and `CLAUDE.md` updated; limits (human login/MFA, no testnet writes) stated
- [ ] **`AGENT_INTEGRATION_PLAN.md` deleted from the branch**
