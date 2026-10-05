import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const sourceSkill = path.join(repoRoot, "skills/monad-agent/SKILL.md");

const targets = [
  path.join(__dirname, "../skills/monad-agent/SKILL.md"),
  path.join(repoRoot, "claude-plugin/skills/monad-agent/SKILL.md"),
];

if (!fs.existsSync(sourceSkill)) {
  console.error(`Source skill not found at ${sourceSkill}`);
  process.exit(1);
}

const content = fs.readFileSync(sourceSkill, "utf8");

for (const target of targets) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, content, "utf8");
  console.log(`Synced skill to ${target}`);
}
