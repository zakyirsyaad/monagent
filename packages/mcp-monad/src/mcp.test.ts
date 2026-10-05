import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ALLOWED_SUBCOMMANDS,
  executeMmCommand,
  getSafeEnv,
  resolveMmPath,
  verifyMmEnvironment,
} from "./cli.js";
import { createMonagentMcpServer } from "./server.js";
import { TOOLS } from "./tools.js";

/**
 * Helper to create a fake executable script in a temporary directory
 */
function createStubScript(content: string): { dir: string; scriptPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-stub-"));
  const scriptPath = path.join(dir, "stub-mm.sh");
  const fullContent = `#!/bin/sh\n${content}`;
  fs.writeFileSync(scriptPath, fullContent, { mode: 0o755 });
  return { dir, scriptPath };
}

describe("@zakyirsyaad/monagent-mcp: CLI execution & safety", () => {
  it("safe env filters sensitive environment variables and keeps only allowed keys", () => {
    const originalEnv = { ...process.env };
    process.env.SECRET_KEY = "super_secret_key";
    process.env.AWS_SECRET_ACCESS_KEY = "aws_secret";
    process.env.MM_PASSWORD = "test_password";

    try {
      const safeEnv = getSafeEnv();
      assert.equal(safeEnv.SECRET_KEY, undefined);
      assert.equal(safeEnv.AWS_SECRET_ACCESS_KEY, undefined);
      assert.equal(safeEnv.MM_PASSWORD, "test_password");
    } finally {
      delete process.env.SECRET_KEY;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      if (!originalEnv.MM_PASSWORD) delete process.env.MM_PASSWORD;
    }
  });

  it("enforces allowed subcommands allowlist and rejects arbitrary commands", async () => {
    await assert.rejects(
      executeMmCommand({
        subcommand: "evil_command" as any,
        args: [],
      }),
      /Command not allowed/
    );

    assert.equal(ALLOWED_SUBCOMMANDS.length, 9);
  });

  it("prevents shell injection: command runs without shell and sends literal arguments", async () => {
    // Stub records the exact raw arguments passed to argv
    const { dir, scriptPath } = createStubScript(`
      echo '{"ok": true, "data": {"args": ["' "$@" '"]}}'
    `);

    try {
      const maliciousInput = "0x1234567890123456789012345678901234567890; rm -rf /tmp/evil";
      const result = await executeMmCommand({
        subcommand: "pay",
        args: ["--to", maliciousInput],
        mmPath: scriptPath,
      });

      assert.equal(result.ok, true);
      assert.ok(result.rawStdout.includes(maliciousInput));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles AWAITING_MFA notice and sets isAwaitingMfa flag", async () => {
    const { dir, scriptPath } = createStubScript(`
      echo '[AWAITING_MFA] Please approve transaction in MetaMask' >&2
      exit 0
    `);

    try {
      const result = await executeMmCommand({
        subcommand: "pay",
        args: ["--to", "0x1234567890123456789012345678901234567890"],
        isWrite: true,
        mmPath: scriptPath,
      });

      assert.equal(result.ok, false);
      assert.equal(result.isAwaitingMfa, true);
      assert.equal(result.error?.code, "AWAITING_MFA");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles write command timeout without retrying", async () => {
    const { dir, scriptPath } = createStubScript(`
      sleep 2
      echo '{"ok": true}'
    `);

    try {
      const result = await executeMmCommand({
        subcommand: "pay",
        args: ["--to", "0x1234567890123456789012345678901234567890"],
        isWrite: true,
        timeoutMs: 100, // Trigger fast timeout
        mmPath: scriptPath,
      });

      assert.equal(result.ok, false);
      assert.equal(result.error?.code, "COMMAND_TIMEOUT");
      assert.match(result.error?.message || "", /DO NOT RETRY/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("startup verification checks for mm version and plugin presence", async () => {
    // 1. Stub for missing plugin
    const { dir: dir1, scriptPath: scriptNoPlugin } = createStubScript(`
      if [ "$1" = "--version" ]; then
        echo "@metamask/agent-wallet/6.2.0 darwin-arm64"
        exit 0
      fi
      if [ "$1" = "plugins" ]; then
        echo "other-plugin 1.0.0"
        exit 0
      fi
    `);

    try {
      await assert.rejects(
        verifyMmEnvironment(scriptNoPlugin),
        /MonAgent plugin is not installed/
      );
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
    }

    // 2. Stub for incompatible mm version
    const { dir: dir2, scriptPath: scriptOldVersion } = createStubScript(`
      if [ "$1" = "--version" ]; then
        echo "@metamask/agent-wallet/5.0.0 darwin-arm64"
        exit 0
      fi
    `);

    try {
      await assert.rejects(
        verifyMmEnvironment(scriptOldVersion),
        /MonAgent requires CLI \^6\.2\.0 \|\| \^7\.0\.0/
      );
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }

    // 3. Stub for valid mm environment
    const { dir: dir3, scriptPath: scriptValid } = createStubScript(`
      if [ "$1" = "--version" ]; then
        echo "@metamask/agent-wallet/7.0.0 darwin-arm64"
        exit 0
      fi
      if [ "$1" = "plugins" ]; then
        echo "@zakyirsyaad/monagent-plugin 0.2.0 (0.2.0)"
        exit 0
      fi
    `);

    try {
      const res = await verifyMmEnvironment(scriptValid);
      assert.equal(res.mmVersion, "7.0.0");
      assert.equal(res.hasPlugin, true);
    } finally {
      fs.rmSync(dir3, { recursive: true, force: true });
    }
  });
});

describe("@zakyirsyaad/monagent-mcp: MCP Server & Tools integration", () => {
  it("tools/list returns 9 tools with descriptions, annotations, and schemas", async () => {
    const server = createMonagentMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    const toolsResult = await client.listTools();
    assert.equal(toolsResult.tools.length, 9);

    const expectedTools = [
      "monad_pay",
      "monad_identity_register",
      "monad_identity_get",
      "monad_reputation_check",
      "monad_reputation_give",
      "monad_x402_pay",
      "monad_jobs_create",
      "monad_jobs_complete",
      "monad_jobs_refund",
    ];

    for (const expected of expectedTools) {
      const found = toolsResult.tools.find((t) => t.name === expected);
      assert.ok(found, `Tool ${expected} should be registered`);
      assert.ok(found.description);
      assert.ok(found.inputSchema);
    }

    // Check read/write annotations
    const identityGet = toolsResult.tools.find((t) => t.name === "monad_identity_get");
    assert.equal(identityGet?.annotations?.readOnlyHint, true);

    const payTool = toolsResult.tools.find((t) => t.name === "monad_pay");
    assert.equal(payTool?.annotations?.readOnlyHint, false);
    assert.equal(payTool?.annotations?.destructiveHint, true);
  });

  it("executes read tool end-to-end against stub mm and returns structured response", async () => {
    const { dir, scriptPath } = createStubScript(`
      echo '{"ok": true, "data": {"agentId": 42, "owner": "0x1111111111111111111111111111111111111111", "walletAddress": "0x2222222222222222222222222222222222222222", "card": {"name": "TestBot", "description": "AI Worker"}}}'
    `);

    try {
      const server = createMonagentMcpServer({ mmPath: scriptPath });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
      await client.connect(clientTransport);

      const response: any = await client.callTool({
        name: "monad_identity_get",
        arguments: {
          agentId: "42",
          chainId: 10143,
        },
      });

      assert.equal(response.isError, undefined);
      assert.ok(response.content);
      const text = response.content[0].text;
      assert.match(text, /Agent ID: #42/);
      assert.match(text, /TestBot/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("executes write tool end-to-end against stub mm and preserves explorer URL", async () => {
    const { dir, scriptPath } = createStubScript(`
      echo '{"ok": true, "data": {"transactionHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"}}'
    `);

    try {
      const server = createMonagentMcpServer({ mmPath: scriptPath });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
      await client.connect(clientTransport);

      const response: any = await client.callTool({
        name: "monad_pay",
        arguments: {
          to: "0x1234567890123456789012345678901234567890",
          amount: "1.5",
          chainId: 143,
        },
      });

      assert.equal(response.isError, undefined);
      const text = response.content[0].text;
      assert.match(text, /Sent 1.5 MON to 0x1234567890123456789012345678901234567890 on chain 143/);
      assert.match(text, /https:\/\/monadexplorer\.com\/tx\/0xabcdef/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves plugin error codes in isError results", async () => {
    const { dir, scriptPath } = createStubScript(`
      echo '{"ok": false, "error": {"code": "ESCROW_NOT_DEPLOYED", "message": "Escrow contract not deployed on Monad mainnet (143)"}}'
    `);

    try {
      const server = createMonagentMcpServer({ mmPath: scriptPath });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
      await client.connect(clientTransport);

      const response: any = await client.callTool({
        name: "monad_jobs_create",
        arguments: {
          workerAddress: "0x1234567890123456789012345678901234567890",
          bountyMon: "1.0",
          taskDescription: "Audit code",
          chainId: 10143,
        },
      });

      assert.equal(response.isError, true);
      const text = response.content[0].text;
      assert.match(text, /ESCROW_NOT_DEPLOYED: Escrow contract not deployed on Monad mainnet/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid input schema before executing CLI", async () => {
    const server = createMonagentMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    const response: any = await client.callTool({
      name: "monad_pay",
      arguments: {
        to: "not-an-evm-address",
        amount: "invalid-amount",
        chainId: 99999, // unsupported chain
      },
    });

    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /Input validation error/);
    assert.match(response.content[0].text, /Must be a valid 40-character hexadecimal EVM address/);
  });
});
