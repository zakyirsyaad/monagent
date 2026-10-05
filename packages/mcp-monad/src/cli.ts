import { spawn } from "node:child_process";
import fs from "node:fs";

export const ALLOWED_SUBCOMMANDS = [
  "pay",
  "identity register",
  "identity get",
  "reputation check",
  "reputation give",
  "x402 pay",
  "jobs create",
  "jobs complete",
  "jobs refund",
] as const;

export type AllowedSubcommand = (typeof ALLOWED_SUBCOMMANDS)[number];

export interface CliExecutionResult {
  ok: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    hint?: string;
  };
  rawStdout: string;
  rawStderr: string;
  isAwaitingMfa?: boolean;
  mfaNotice?: any;
}

export interface CliExecutionOptions {
  subcommand: AllowedSubcommand;
  args: string[];
  isWrite?: boolean;
  timeoutMs?: number;
  mmPath?: string;
}

/**
 * Filtered safe environment for child process execution
 */
export function getSafeEnv(): NodeJS.ProcessEnv {
  const allowedKeys = [
    "PATH",
    "HOME",
    "MM_CONFIG_DIR",
    "MM_PASSWORD",
  ];
  const safeEnv: NodeJS.ProcessEnv = {};
  for (const key of allowedKeys) {
    if (process.env[key] !== undefined) {
      safeEnv[key] = process.env[key];
    }
  }
  return safeEnv;
}

/**
 * Extract JSON object from text that may contain CLI warning/banner prefixes
 */
export function extractJsonPayload(text: string): any {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  return null;
}

/**
 * Resolve the mm executable path from environment or default
 */
export function resolveMmPath(overridePath?: string): string {
  if (overridePath) return overridePath;
  if (process.env.MM_PATH) return process.env.MM_PATH;
  return "mm";
}

/**
 * Execute an allowed mm monad command without a shell
 */
export async function executeMmCommand(
  options: CliExecutionOptions
): Promise<CliExecutionResult> {
  const { subcommand, args, isWrite = false } = options;

  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`Command not allowed: "mm monad ${subcommand}"`);
  }

  const mmExecutable = resolveMmPath(options.mmPath);
  const subcmdParts = subcommand.split(" ");
  const fullArgs = ["monad", ...subcmdParts, ...args, "--json"];

  // Reads: 30s timeout. Writes: 180s timeout (allows time for human MFA approval in MetaMask).
  const defaultTimeout = isWrite ? 180_000 : 30_000;
  const timeoutMs = options.timeoutMs ?? defaultTimeout;

  return new Promise<CliExecutionResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(mmExecutable, fullArgs, {
      shell: false,
      env: getSafeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Give SIGKILL shortly after if it doesn't shut down
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 2000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        if (isWrite) {
          // Never retry a write automatically!
          return resolve({
            ok: false,
            error: {
              code: "COMMAND_TIMEOUT",
              message: `Command timed out after ${timeoutMs}ms waiting for wallet approval or response. DO NOT RETRY automatically without verifying transaction status on-chain.`,
              hint: "Check pending transactions with 'mm wallet requests list' or on an explorer before re-submitting.",
            },
            rawStdout: stdout,
            rawStderr: stderr,
          });
        }
        return resolve({
          ok: false,
          error: {
            code: "COMMAND_TIMEOUT",
            message: `Read command timed out after ${timeoutMs}ms.`,
          },
          rawStdout: stdout,
          rawStderr: stderr,
        });
      }

      // 1. Try parsing structured JSON response from stdout or stderr
      const stdoutJson = extractJsonPayload(stdout);
      const stderrJson = extractJsonPayload(stderr);
      const finalJson = stdoutJson || stderrJson;

      if (finalJson && typeof finalJson === "object") {
        if (finalJson.ok === true) {
          return resolve({
            ok: true,
            data: finalJson.data,
            rawStdout: stdout,
            rawStderr: stderr,
          });
        }
        if (finalJson.ok === false && finalJson.error) {
          return resolve({
            ok: false,
            error: {
              code: finalJson.error.code || "COMMAND_FAILED",
              message: finalJson.error.message || "Command failed",
              hint: finalJson.error.hint,
            },
            rawStdout: stdout,
            rawStderr: stderr,
          });
        }
      }

      // 2. If no final JSON was returned, check if execution ended/paused awaiting human MFA approval
      const combined = stdout + "\n" + stderr;
      if (
        combined.includes("[AWAITING_MFA]") ||
        combined.includes('"kind":"AWAITING_MFA"') ||
        combined.includes('"kind": "AWAITING_MFA"')
      ) {
        return resolve({
          ok: false,
          isAwaitingMfa: true,
          error: {
            code: "AWAITING_MFA",
            message:
              "Transaction paused awaiting human approval in MetaMask. Please approve the request in the MetaMask mobile app or browser extension.",
            hint: "Run 'mm wallet requests watch <id>' or check 'mm wallet requests list' to track approval.",
          },
          rawStdout: stdout,
          rawStderr: stderr,
        });
      }

      // 3. Handle non-zero exit code when no structured error JSON was found
      if (code !== 0) {
        return resolve({
          ok: false,
          error: {
            code: "CLI_ERROR",
            message: stderr.trim() || stdout.trim() || `CLI exited with code ${code}`,
          },
          rawStdout: stdout,
          rawStderr: stderr,
        });
      }

      const trimmedStdout = stdout.trim();
      return resolve({
        ok: true,
        data: trimmedStdout,
        rawStdout: stdout,
        rawStderr: stderr,
      });
    });
  });
}

/**
 * Startup sanity verification for mm CLI and plugin availability
 */
export async function verifyMmEnvironment(mmPathOverride?: string): Promise<{
  mmVersion: string;
  hasPlugin: boolean;
}> {
  const mmExecutable = resolveMmPath(mmPathOverride);

  // 1. Verify mm executable and version
  const versionResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(mmExecutable, ["--version"], {
        shell: false,
        env: getSafeEnv(),
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    }
  );

  if (versionResult.code !== 0) {
    throw new Error(
      `MetaMask CLI "${mmExecutable}" failed to execute: ${versionResult.stderr || versionResult.stdout}`
    );
  }

  const versionOutput = versionResult.stdout.trim();
  const versionMatch =
    versionOutput.match(/@metamask\/agent-wallet\/(\d+\.\d+\.\d+)/) ||
    versionOutput.match(/(\d+\.\d+\.\d+)/);
  if (!versionMatch) {
    throw new Error(`Unable to determine version from mm CLI output: "${versionOutput}"`);
  }

  const version = versionMatch[1];
  const major = parseInt(version.split(".")[0], 10);
  const minor = parseInt(version.split(".")[1], 10);

  if (!((major === 6 && minor >= 2) || major === 7)) {
    throw new Error(
      `MetaMask Agent Wallet CLI version ${version} is incompatible. MonAgent requires CLI ^6.2.0 || ^7.0.0.`
    );
  }

  // 2. Verify plugin is installed
  const pluginsResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(mmExecutable, ["plugins"], {
        shell: false,
        env: getSafeEnv(),
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    }
  );

  const pluginsOutput = (pluginsResult.stdout + "\n" + pluginsResult.stderr).toLowerCase();
  const hasPlugin = pluginsOutput.includes("monagent-plugin") || pluginsOutput.includes("monagent");

  if (!hasPlugin) {
    throw new Error(
      `MonAgent plugin is not installed in "${mmExecutable}". Install it with:\nmm plugins install @zakyirsyaad/monagent-plugin --accept-permissions`
    );
  }

  return {
    mmVersion: version,
    hasPlugin: true,
  };
}
