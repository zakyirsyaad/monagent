# Brief: `mm monad skill` output and `publishConfig`

Working scope for this PR. **Delete this file before merging** (last item of the checklist).

Baseline: `main` at `a7ac39d`. npm: plugin `0.2.0`, MCP server `0.1.0`.

## Task 1. `mm monad skill` prints the skill twice

What I observed with the published `0.2.0` plugin on `mm` 7.0.0:

- In a terminal, the skill text appears twice: once from `io.emit(content)` and again as the
  `content:` field of the rendered result.
- Not in a terminal (pipe or redirect), stdout is JSON (`{"ok": true, "data": {"installed": false,
  "content": "…"}}`) and the raw markdown goes to **stderr**. So `mm monad skill > SKILL.md` writes JSON,
  not markdown.
- `--json` is fine for agents: stdout has the whole text once (`data.content`, about 7.8k chars).
- `--install <target>` prints `Installed MonAgent skill to …` and then the result block, which repeats
  the same path.

Where: `packages/plugin-monad/src/commands/monad/skill.ts`
(`io.emit(content)` around line 154, `io.emit("Installed …")` around line 177).

What "done" looks like:
- The skill text appears **once** in a terminal, and once in `--json` stdout (`data.content`).
- The install path is shown once, not both as an emitted line and as a result field.
- There is a documented way to get a clean markdown file. Options: `mm monad skill --install <target>`,
  or `mm monad skill --json | jq -r .data.content > SKILL.md`.
- Don't add a `--raw` flag that writes straight to `process.stdout`; that would break the JSON contract
  hosts and agents rely on. Only add it if the host gives commands a supported way to do that.
- The result shape (`installed`, `target`, `path`, `content`) stays compatible; the MCP server and agents
  may already read it.

Tests:
- `commands.test.ts` has `monad:skill prints skill content when run without --install`, which currently
  asserts that `io.logs` contains `name: monad-agent`, i.e. it asserts the emit. Update that assertion to
  match the new behavior, and keep the assertions on `result.content`.
- Add a test that fails if the skill text is emitted **and** returned (count the occurrences of
  `name: monad-agent` across everything the command writes).
- Keep the install tests (overwrite guard with `--force`, path safety).

Docs: README and SKILL.md show `mm monad skill` and `--install`. Add the `--json | jq -r` form as the
way to get a markdown file.

Release: this changes plugin behavior, so bump `packages/plugin-monad` to `0.2.1`, rebuild so
`oclif.manifest.json` carries the new version, and keep `claude-plugin/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` versions equal to the plugin version (there is a test that enforces it).
Note: the build also reorders commands in `oclif.manifest.json` between runs; the content is the same, so
only commit the manifest if the version or content changed.

## Task 2. `publishConfig` so first publishes are public

Publishing `@zakyirsyaad/monagent-mcp` for the first time failed with `402 Payment Required: You must
sign up for private packages`. npm treats a new scoped package as private unless told otherwise, and we
had to pass `--access public` by hand.

What "done" looks like:
- `packages/mcp-monad/package.json` gets `"publishConfig": { "access": "public" }`.
- `packages/plugin-monad/package.json` gets the same, for consistency (it is already public on npm, so
  this changes nothing there today).
- Verify with `npm publish --dry-run --workspace …` for both packages: no warnings, and the output says
  `public access`, not `default access`.
- Don't add `registry` or `tag` settings; keep the config to `access` only.
- No version bump is needed for the MCP package just for this field. Only bump it if you change
  something else in it.

## Out of scope
- Write rejection after an `AWAITING_MFA` notice being reported as "awaiting approval" in the MCP
  server (separate follow-up).
- An opt-in smoke test against a real `mm`.

## Checklist

- [ ] The skill text appears once in a terminal and once in `--json` stdout
- [ ] The install path is shown once
- [ ] The existing skill print test is updated, and a new test fails if the text is emitted and returned
- [ ] README and SKILL.md explain how to get a markdown file (`--install` or `--json | jq -r`)
- [ ] Plugin `0.2.1`; manifest, `plugin.json` and `marketplace.json` versions match (tests pass)
- [ ] `publishConfig.access = public` in both packages; `npm publish --dry-run` shows public access, no warnings
- [ ] Typecheck, plugin tests, MCP tests, `repository-contents` and the claude-plugin test all green
- [ ] **`SKILL_UX_PUBLISHCONFIG_BRIEF.md` deleted from the branch**
