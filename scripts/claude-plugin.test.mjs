import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

describe("Claude Code plugin and marketplace", () => {
  it("marketplace.json parses and points to the plugin directory with matching version", () => {
    const marketplacePath = path.join(repoRoot, ".claude-plugin/marketplace.json");
    assert.ok(fs.existsSync(marketplacePath), "marketplace.json must exist");

    const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
    assert.equal(typeof marketplace.name, "string");
    assert.ok(Array.isArray(marketplace.plugins), "marketplace must have a plugins array");

    const pluginEntry = marketplace.plugins.find((p) => p.name === "monagent");
    assert.ok(pluginEntry, "marketplace must contain monagent plugin");
    assert.equal(pluginEntry.source, "./claude-plugin");

    const npmPluginPkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "packages/plugin-monad/package.json"), "utf8")
    );
    assert.equal(pluginEntry.version, npmPluginPkg.version, "marketplace version must match npm plugin");
  });

  it("plugin.json parses and version matches packages/plugin-monad", () => {
    const pluginJsonPath = path.join(repoRoot, "claude-plugin/.claude-plugin/plugin.json");
    assert.ok(fs.existsSync(pluginJsonPath), "plugin.json must exist");

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    assert.equal(pluginJson.name, "monagent");

    const npmPluginPkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "packages/plugin-monad/package.json"), "utf8")
    );
    assert.equal(pluginJson.version, npmPluginPkg.version, "plugin.json version must match npm plugin");
  });

  it("claude-plugin's SKILL.md is identical to skills/monad-agent/SKILL.md", () => {
    const sourceSkillPath = path.join(repoRoot, "skills/monad-agent/SKILL.md");
    const pluginSkillPath = path.join(repoRoot, "claude-plugin/skills/monad-agent/SKILL.md");

    assert.ok(fs.existsSync(sourceSkillPath), "Source skill must exist");
    assert.ok(fs.existsSync(pluginSkillPath), "Plugin copy of skill must exist");

    const sourceContent = fs.readFileSync(sourceSkillPath, "utf8");
    const pluginContent = fs.readFileSync(pluginSkillPath, "utf8");

    assert.equal(
      pluginContent,
      sourceContent,
      "claude-plugin/skills/monad-agent/SKILL.md must be byte-for-byte identical to skills/monad-agent/SKILL.md"
    );
  });

  it("claude-plugin/.mcp.json parses and declares the monagent MCP server", () => {
    const mcpJsonPath = path.join(repoRoot, "claude-plugin/.mcp.json");
    assert.ok(fs.existsSync(mcpJsonPath), ".mcp.json must exist");

    const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
    assert.ok(mcpConfig.mcpServers?.monagent, "mcpServers must declare monagent");
    assert.equal(mcpConfig.mcpServers.monagent.command, "npx");
  });
});
