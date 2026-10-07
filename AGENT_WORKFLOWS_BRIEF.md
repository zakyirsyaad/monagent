# Brief: agent workflows

Working scope for this PR. **Delete this file before merging** (last item of the checklist).

Baseline: `main` at `22dd30f`. Published on npm: plugin `0.2.1`, MCP server `0.1.1`.

Two pieces of work, in this order, one commit each. Step 1 is small and fixes something that is wrong
today. Step 2 builds on it.

## Why

The repo `anthropics/financial-services` ships **named workflow agents**: each one has its own system
prompt (`agents/<name>.md`), the skills it uses, slash commands, and explicit limits on what it may do.
MonAgent has one general skill with a single four-step flow. An agent has to invent its own
procedure, and the one flow we do give it can't be completed (see Step 1).

## Step 1. Make `SKILL.md` honest, and add a flow that works today

### What is wrong
`skills/monad-agent/SKILL.md` has an **Escrow (testnet `10143` only)** section (around line 87) and a
**Typical hiring flow** (around line 96) that runs `jobs create` and `jobs complete`. Escrow exists only on
testnet, and MetaMask's wallet service rejects writes on testnet (`Invalid chainId`, and the command waits on
`Submitting...` with nothing sent). An agent following the skill gets stuck at step 2. The README's
"Status and limits" says this; the skill, which is what agents read, doesn't.

### What "done" looks like
- The escrow section says: escrow exists only on testnet, and writes on testnet are currently rejected by
  MetaMask. If a write on `10143` hangs or returns `Invalid chainId`, stop: nothing was sent. Tell the
  user, and don't retry or switch chains without asking.
- **Replace** "Typical hiring flow" with a flow that works today, for example **vet, pay, rate**:
  1. `mm monad reputation check <agentId> --chain-id 143 --json`, then apply a decision rule for the tiers
     (`HIGH` go on; `MEDIUM` mention it and continue only if the user agrees; `LOW` stop; `UNRATED` ask).
  2. Confirm with the user: chain, recipient, amount and token. Wait for an explicit yes.
  3. `mm monad pay …`, then report the transaction hash and the explorer link.
  4. Offer `mm monad reputation give` (and remind them not to rate their own agent).
- Add a rule under "Rules for agents": **confirm before every write** (state chain, recipient, amount, token),
  and be extra explicit for `--chain-id 143`, which moves real funds.
- Add `Invalid chainId` / a write stuck on `Submitting...` on `10143` to the error table, with the action
  "stop, nothing was sent, use 143 or ask the user".
- Regenerate the synced copies (the build runs `sync-skill.mjs`); the three copies must stay identical.
- Check the MCP tool descriptions for the three `monad_jobs_*` tools. They say "only deployed on testnet"
  but not that testnet writes are currently rejected. Decide whether to say so; changing descriptions
  means a new MCP version, so it can be a follow-up.

## Step 2. Named workflow agents, skills and slash commands

### Workflows (all work today)
| Workflow | Steps | Writes | Must stop for |
|---|---|---|---|
| **Vet counterparty** | `identity get`, `reputation check`, then a verdict (tier plus the reasons) | none | nothing; works on both chains |
| **Pay a vetted agent** | vet, confirm, `pay` on mainnet, report the explorer link, offer feedback | yes | explicit user confirmation; `[AWAITING_MFA]` |
| **Buy a paid API call** | confirm `--maxSpend` and `--payer`, `x402 pay`, return the response and `paymentDetails` | yes | explicit confirmation; `PAYER_MISMATCH`, `MAX_SPEND_EXCEEDED` |
| **Register my agent** | `identity register`, record the `agentId`, check it with `identity get` | yes | explicit confirmation of name, description and endpoint |

Do **not** build an escrow or "hire" workflow yet. Mention it as blocked until MetaMask supports testnet
writes or the escrow is deployed to mainnet.

### Layout
Under `claude-plugin/` (adjust if current Claude Code docs say otherwise; the format below matches the
plugins installed locally):
```
claude-plugin/agents/<name>.md       # frontmatter: name, description, optional model; body = system prompt
claude-plugin/commands/<name>.md     # frontmatter: description, argument-hint; body = the procedure
claude-plugin/skills/<workflow>/SKILL.md
```
Suggested names: agents `counterparty-vetter`, `agent-payer`, `api-buyer`, `identity-registrar`; commands
`/monad-vet <agentId> [chainId]`, `/monad-pay-agent <agentId> <amount> <token>`, `/monad-buy-api <url>`,
`/monad-register-agent`. Keep the general `monad-agent` skill as the shared reference that each workflow
points to; don't copy its tables into every agent.

### Guardrails every agent prompt must carry
- Read first, write only after the user says yes to chain, recipient, amount and token.
- Pass `--chain-id` explicitly. Default to `143` for writes; never fall back to `10143` silently.
- Never retry a write on a timeout or error; check the explorer or `mm wallet requests list` first.
- On `[AWAITING_MFA]`, stop and tell the user what to approve; don't resubmit.
- Never ask for, print or store private keys, mnemonics or passwords.
- Say plainly when something can't be done (for example escrow today) instead of trying it.

### Keeping a single source of truth
`sync-skill.mjs` copies only `skills/monad-agent/SKILL.md`. With more skills, either generalise it to copy
every `skills/*/SKILL.md` into `claude-plugin/skills/` (and the npm package if `mm monad skill` should
offer them), or make `claude-plugin/` the source for the workflow skills and say so. Whichever you pick,
the tests must enforce it.

### Tests
Extend `scripts/claude-plugin.test.mjs` (or add a sibling test):
- Every agent, command and skill file has valid frontmatter with the required fields, and names match
  the file or folder name.
- Every `mm monad …` command and `--flag` mentioned in any of them exists in
  `packages/plugin-monad/oclif.manifest.json` (a script that does this is easy to write; I used one to
  check the README).
- Every command or agent that refers to a skill or agent points to one that exists.
- Plugin version still equals the npm plugin version (the existing test).

### What can't be tested here
Agent behavior depends on the model, so the tests can only check structure. Please run each workflow in
Claude Code and paste the transcript in the PR: for **Vet counterparty** a real run on mainnet reads;
for the write workflows, the transcript up to the confirmation prompt (or a real run if the wallet is
funded). Also try `/plugin marketplace add` and `/plugin install monagent@monagent-marketplace` once, since
those commands in the README haven't been run.

## Out of scope
- An escrow or hiring workflow (blocked, see above).
- Managed Agents API templates (`agent.yaml`) and hosted deployment.
- New MCP tools or changes to MCP behavior.
- LICENSE and publishing (already merged / separate).

## Release
Skill content ships inside the npm plugin, so Step 1 changes the published package. The working tree
currently has local, unpublished bumps (plugin `0.2.2`, MCP `0.1.2`, for the license release). **Don't
commit those in this PR.** Publish that release first, then bump from whatever is on npm at that point,
and keep `claude-plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` versions equal
to the plugin version (a test enforces it).

## Checklist

Step 1
- [ ] Escrow section says testnet writes are currently rejected by MetaMask and what to do
- [ ] "Typical hiring flow" replaced by a flow that runs today, with a decision rule for each trust tier
- [ ] A "confirm before every write" rule, and an error-table row for `Invalid chainId` / stuck `Submitting...`
- [ ] The three `SKILL.md` copies are identical (existing test passes)

Step 2
- [ ] Four workflows as agents plus skills plus slash commands, with the guardrails above in each prompt
- [ ] No escrow or hiring workflow added
- [ ] Single source of truth for the skills, enforced by a test
- [ ] Structure test: valid frontmatter, every `mm monad` command and flag exists in the manifest, no dangling references
- [ ] Transcripts of the workflows run in Claude Code are in the PR, or a note on which were not run

All
- [ ] Typecheck, plugin tests, MCP tests and `node --test scripts/*.test.mjs` green; no `AGENTS.md` or `docs/` added
- [ ] README, `REFERENCE.md` and `CLAUDE.md` updated for the new agents and commands
- [ ] Local unpublished version bumps are not in the diff
- [ ] **`AGENT_WORKFLOWS_BRIEF.md` deleted from the branch**
