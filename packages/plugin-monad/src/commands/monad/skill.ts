import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseMonadPluginCommand,
  type CommandIO,
  CommandError,
  InputFieldType,
  type InputSchema,
} from "../../sdk.js";
import { PluginCommand } from "@metamask/agent-wallet/plugin";

export interface MonadSkillResult {
  installed: boolean;
  target?: string;
  path?: string;
  content?: string;
}

export type SkillInstallTarget =
  | "claude-project"
  | "claude-user"
  | "agents-project"
  | "agents-user"
  | "codex-project"
  | "codex-user";

const VALID_TARGETS: readonly SkillInstallTarget[] = [
  "claude-project",
  "claude-user",
  "agents-project",
  "agents-user",
  "codex-project",
  "codex-user",
] as const;

function resolveTargetLocation(
  target: string,
  cwd: string = process.cwd(),
  homedir: string = os.homedir()
): { baseDir: string; relPath: string; fullPath: string } {
  let baseDir: string;
  let relPath: string;

  switch (target) {
    case "claude-project":
      baseDir = cwd;
      relPath = path.join(".claude", "skills", "monad-agent", "SKILL.md");
      break;
    case "claude-user":
      baseDir = homedir;
      relPath = path.join(".claude", "skills", "monad-agent", "SKILL.md");
      break;
    case "agents-project":
      baseDir = cwd;
      relPath = path.join(".agents", "skills", "monad-agent", "SKILL.md");
      break;
    case "agents-user":
      baseDir = homedir;
      relPath = path.join(".agents", "skills", "monad-agent", "SKILL.md");
      break;
    case "codex-project":
      baseDir = cwd;
      relPath = path.join(".codex", "skills", "monad-agent", "SKILL.md");
      break;
    case "codex-user":
      baseDir = homedir;
      relPath = path.join(".codex", "skills", "monad-agent", "SKILL.md");
      break;
    default:
      throw new CommandError(
        "INVALID_INPUT",
        `Unknown target "${target}". Must be one of: ${VALID_TARGETS.join(", ")}.`,
        "Provide a supported skill install target."
      );
  }

  const normalizedBase = path.resolve(baseDir);
  const fullPath = path.resolve(normalizedBase, relPath);

  // Path safety: protect against directory traversal
  const expectedPrefix = normalizedBase + path.sep;
  if (!fullPath.startsWith(expectedPrefix)) {
    throw new CommandError(
      "INVALID_INPUT",
      `Target path "${fullPath}" escapes root directory "${normalizedBase}".`,
      "Target paths must resolve inside the destination root."
    );
  }

  return { baseDir: normalizedBase, relPath, fullPath };
}

function loadSkillContent(): string {
  // Try relative to this file in dist/
  const candidatePaths = [
    // In installed/bundled package: ../../../skills/monad-agent/SKILL.md from dist/commands/monad/skill.js
    fileURLToPath(new URL("../../../skills/monad-agent/SKILL.md", import.meta.url)),
    // In development mode from src/:
    fileURLToPath(new URL("../../../skills/monad-agent/SKILL.md", import.meta.url)),
    // From root repo skills directory:
    fileURLToPath(new URL("../../../../../skills/monad-agent/SKILL.md", import.meta.url)),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }

  throw new CommandError(
    "SKILL_NOT_FOUND",
    "MonAgent skill definition (SKILL.md) not found in package.",
    "Verify the plugin was packaged correctly with bundled skills."
  );
}

export class MonadSkillCommand extends BaseMonadPluginCommand<MonadSkillResult> {
  static description = "Print or install the MonAgent AI agent skill definition (SKILL.md)";
  static requiresAuth = false;
  static requiresInit = false;
  protected override readonly pluginCommandId = "monad:skill";

  public static readonly inputs: InputSchema = {
    install: {
      type: InputFieldType.Text,
      flag: "install",
      message:
        "Install target destination (claude-project, claude-user, agents-project, agents-user, codex-project, codex-user)",
      required: false,
      prompt: false,
    },
    force: {
      type: InputFieldType.Boolean,
      flag: "force",
      message: "Overwrite existing skill file without error",
      default: false,
      required: false,
      prompt: false,
    },
  };

  static flags = PluginCommand.flagsWithInputs(this.inputs);

  async execute(io: CommandIO): Promise<MonadSkillResult> {
    const rawInputs = await io.resolveInputs(MonadSkillCommand.inputs);
    const content = loadSkillContent();

    const installTarget = rawInputs.install ? String(rawInputs.install).trim() : "";
    const isForce = Boolean(rawInputs.force);

    if (!installTarget) {
      return {
        installed: false,
        content,
      };
    }

    const { fullPath } = resolveTargetLocation(installTarget);

    if (fs.existsSync(fullPath) && !isForce) {
      throw new CommandError(
        "FILE_EXISTS",
        `Skill file already exists at ${fullPath}.`,
        "Pass --force to overwrite the existing skill file."
      );
    }

    const targetDir = path.dirname(fullPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf8");

    return {
      installed: true,
      target: installTarget,
      path: fullPath,
    };
  }
}
