import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pluginDir = path.join(repoRoot, "claude-plugin");

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "packages/plugin-monad/oclif.manifest.json"), "utf8")
);

const WORKFLOWS = [
  { skill: "vet-counterparty", agent: "counterparty-vetter", command: "monad-vet", writes: false },
  { skill: "pay-vetted-agent", agent: "agent-payer", command: "monad-pay-agent", writes: true },
  { skill: "buy-x402-api", agent: "api-buyer", command: "monad-buy-api", writes: true },
  {
    skill: "register-agent-identity",
    agent: "identity-registrar",
    command: "monad-register-agent",
    writes: true,
  },
];

function parseFrontmatter(file) {
  const content = fs.readFileSync(file, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${file}: must start with a --- frontmatter block`);
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return { file, fm, body: content.slice(match[0].length) };
}

const agentNames = fs
  .readdirSync(path.join(pluginDir, "agents"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));
const commandNames = fs
  .readdirSync(path.join(pluginDir, "commands"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));
const skillNames = fs
  .readdirSync(path.join(pluginDir, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const agents = agentNames.map((n) =>
  parseFrontmatter(path.join(pluginDir, "agents", `${n}.md`))
);
const commands = commandNames.map((n) =>
  parseFrontmatter(path.join(pluginDir, "commands", `${n}.md`))
);
const skills = skillNames.map((n) =>
  parseFrontmatter(path.join(pluginDir, "skills", n, "SKILL.md"))
);
const allDocs = [...agents, ...commands, ...skills];

// Every flag declared anywhere in the plugin manifest, plus the host-global output flags.
const allManifestFlags = new Set(["format", "json", "toon", "verbose"]);
for (const command of Object.values(manifest.commands)) {
  for (const flag of Object.keys(command.flags ?? {})) allManifestFlags.add(flag);
}

function resolveCommandId(word1, word2) {
  const withSub = word2 ? `monad:${word1}:${word2}` : null;
  if (withSub && manifest.commands[withSub]) return withSub;
  if (manifest.commands[`monad:${word1}`]) return `monad:${word1}`;
  // Family mentions like "mm monad jobs …" are allowed when the family exists.
  const family = `monad:${word1}:`;
  if (Object.keys(manifest.commands).some((id) => id.startsWith(family))) return null;
  return withSub ?? `monad:${word1}`;
}

describe("MonAgent workflow agents, commands and skills", () => {
  it("ships the four workflows as agent + command + skill", () => {
    for (const w of WORKFLOWS) {
      assert.ok(agentNames.includes(w.agent), `missing agent ${w.agent}`);
      assert.ok(commandNames.includes(w.command), `missing command ${w.command}`);
      assert.ok(skillNames.includes(w.skill), `missing skill ${w.skill}`);
    }
    assert.deepEqual(skillNames.slice().sort(), [
      "buy-x402-api",
      "monad-agent",
      "pay-vetted-agent",
      "register-agent-identity",
      "vet-counterparty",
    ]);
  });

  it("adds no escrow or hiring workflow", () => {
    for (const name of [...agentNames, ...commandNames, ...skillNames]) {
      assert.ok(!/escrow|hire|hiring|job/i.test(name), `unexpected escrow/hiring artifact: ${name}`);
    }
    for (const doc of allDocs) {
      if (doc.fm.name === "monad-agent") continue; // the shared skill documents the blocked commands
      assert.ok(
        !/mm monad jobs/.test(doc.body),
        `${doc.file}: must not instruct running escrow (jobs) commands`
      );
    }
  });

  it("agent frontmatter is valid and names match files", () => {
    for (const doc of agents) {
      const expected = path.basename(doc.file, ".md");
      assert.equal(doc.fm.name, expected, `${doc.file}: name must match file name`);
      assert.ok(doc.fm.description?.length > 20, `${doc.file}: description is required`);
    }
  });

  it("command frontmatter has description and argument-hint", () => {
    for (const doc of commands) {
      assert.ok(doc.fm.description?.length > 10, `${doc.file}: description is required`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(doc.fm, "argument-hint"),
        `${doc.file}: argument-hint is required`
      );
    }
  });

  it("skill frontmatter is valid and names match folders", () => {
    for (const doc of skills) {
      const expected = path.basename(path.dirname(doc.file));
      assert.equal(doc.fm.name, expected, `${doc.file}: name must match folder name`);
      assert.ok(doc.fm.description?.length > 20, `${doc.file}: description is required`);
    }
  });

  it("every mm monad command mentioned exists in the oclif manifest", () => {
    const problems = [];
    for (const doc of allDocs) {
      for (const m of doc.body.matchAll(/mm monad ([a-z0-9]+)(?: ([a-z0-9]+))?/g)) {
        const id = resolveCommandId(m[1], m[2]);
        if (id && !manifest.commands[id]) {
          problems.push(
            `${path.basename(doc.file)}: unknown command "mm monad ${m[1]}${m[2] ? ` ${m[2]}` : ""}" (${id})`
          );
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it("every flag in an mm monad invocation exists on that command", () => {
    const problems = [];
    const invocation = /mm monad ([a-z0-9]+)(?: ([a-z0-9]+))?([^\n]*(?:\n[ \t]+[^\n]*)*)/g;
    for (const doc of allDocs) {
      for (const m of doc.body.matchAll(invocation)) {
        const id = resolveCommandId(m[1], m[2]);
        if (!id) continue;
        const allowed = new Set([
          "format",
          "json",
          "toon",
          "verbose",
          ...Object.keys(manifest.commands[id].flags ?? {}),
        ]);
        let tail = m[3];
        const tick = tail.indexOf("`");
        if (tick !== -1) tail = tail.slice(0, tick); // stop at the end of inline code
        for (const f of tail.matchAll(/--([A-Za-z][\w-]*)/g)) {
          if (!allowed.has(f[1])) {
            problems.push(`${path.basename(doc.file)}: --${f[1]} is not a flag of ${id}`);
          }
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it("every backticked --flag exists somewhere in the manifest", () => {
    const problems = [];
    for (const doc of allDocs) {
      for (const m of doc.body.matchAll(/`--([A-Za-z][\w-]*)/g)) {
        if (!allManifestFlags.has(m[1])) {
          problems.push(`${path.basename(doc.file)}: unknown flag --${m[1]}`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it("has no dangling skill, agent or command references", () => {
    const problems = [];
    for (const doc of allDocs) {
      for (const m of doc.body.matchAll(/the `([a-z0-9-]+)` skill/g)) {
        if (!skillNames.includes(m[1])) problems.push(`${path.basename(doc.file)}: unknown skill ${m[1]}`);
      }
      for (const m of doc.body.matchAll(/the `([a-z0-9-]+)` agent/g)) {
        if (!agentNames.includes(m[1])) problems.push(`${path.basename(doc.file)}: unknown agent ${m[1]}`);
      }
      for (const m of doc.body.matchAll(/`(\/monad-[a-z-]+)`/g)) {
        if (!commandNames.includes(m[1].slice(1))) {
          problems.push(`${path.basename(doc.file)}: unknown command ${m[1]}`);
        }
      }
      for (const m of doc.body.matchAll(/skills\/([a-z0-9-]+)/g)) {
        if (!skillNames.includes(m[1])) problems.push(`${path.basename(doc.file)}: unknown skill path ${m[1]}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  it("each workflow command and agent point to their own skill", () => {
    for (const w of WORKFLOWS) {
      const command = commands.find((c) => path.basename(c.file, ".md") === w.command);
      const agent = agents.find((a) => a.fm.name === w.agent);
      assert.ok(command.body.includes(w.skill), `${w.command} must reference the ${w.skill} skill`);
      assert.ok(agent.body.includes(w.skill), `${w.agent} must reference the ${w.skill} skill`);
    }
  });

  it("every agent prompt carries the shared guardrails", () => {
    for (const doc of agents) {
      const name = doc.fm.name;
      assert.match(doc.body, /--chain-id/, `${name}: must require an explicit chain`);
      assert.match(doc.body, /10143/, `${name}: must name the rejected testnet chain`);
      assert.match(doc.body, /[Rr]etry/, `${name}: must forbid blind write retries`);
      assert.match(doc.body, /private keys/, `${name}: must forbid touching keys`);
    }
    for (const doc of agents.filter((a) => a.fm.name !== "counterparty-vetter")) {
      const name = doc.fm.name;
      assert.match(doc.body, /AWAITING_MFA/, `${name}: must stop on AWAITING_MFA`);
      assert.match(doc.body, /explicit yes|says yes/, `${name}: must confirm before writing`);
    }
  });

  it("every workflow skill has a Guardrails section", () => {
    for (const w of WORKFLOWS) {
      const skill = skills.find((s) => s.fm.name === w.skill);
      assert.match(skill.body, /## Guardrails/, `${w.skill}: missing Guardrails section`);
    }
  });

  it("keeps a single source of truth for skills", () => {
    // The general skill is sourced in skills/ and synced into the plugin and the npm package.
    const rootSkills = fs
      .readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    assert.deepEqual(rootSkills, ["monad-agent"], "skills/ must only source the shared monad-agent skill");

    const packageSkills = fs
      .readdirSync(path.join(repoRoot, "packages/plugin-monad/skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    assert.deepEqual(
      packageSkills,
      ["monad-agent"],
      "the npm package ships only the shared monad-agent skill"
    );

    // Workflow skills are sourced in claude-plugin/skills/ and live nowhere else.
    for (const w of WORKFLOWS) {
      assert.ok(
        !fs.existsSync(path.join(repoRoot, "skills", w.skill)),
        `${w.skill} must be sourced in claude-plugin/skills/, not skills/`
      );
      assert.ok(
        !fs.existsSync(path.join(repoRoot, "packages/plugin-monad/skills", w.skill)),
        `${w.skill} must not be copied into the npm package`
      );
    }

    const source = fs.readFileSync(path.join(repoRoot, "skills/monad-agent/SKILL.md"), "utf8");
    const packageCopy = fs.readFileSync(
      path.join(repoRoot, "packages/plugin-monad/skills/monad-agent/SKILL.md"),
      "utf8"
    );
    assert.equal(packageCopy, source, "the npm package copy of monad-agent must stay in sync");
  });
});
