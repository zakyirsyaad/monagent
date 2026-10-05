#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { verifyMmEnvironment } from "./cli.js";
import { createMonagentMcpServer } from "./server.js";

async function main() {
  // 1. Startup sanity checks: mm CLI and plugin existence
  try {
    const { mmVersion } = await verifyMmEnvironment();
    // Log to stderr to avoid corrupting stdio JSON-RPC transport on stdout
    process.stderr.write(`[monagent-mcp] Connected to MetaMask CLI v${mmVersion} with MonAgent plugin.\n`);
  } catch (err: any) {
    process.stderr.write(`[monagent-mcp] Startup verification failed: ${err.message}\n`);
    process.exit(1);
  }

  // 2. Initialize and run server over stdio
  const server = createMonagentMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[monagent-mcp] Fatal error: ${err.stack || err}\n`);
  process.exit(1);
});
