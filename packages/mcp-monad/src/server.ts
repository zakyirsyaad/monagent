import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeMmCommand } from "./cli.js";
import { TOOLS } from "./tools.js";

export function createMonagentMcpServer(options?: { mmPath?: string }): McpServer {
  const server = new McpServer(
    {
      name: "monagent-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  for (const toolDef of TOOLS) {
    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        annotations: toolDef.annotations,
        inputSchema: toolDef.schema.shape,
      },
      async (args: any) => {
        // 1. Validate inputs through tool Zod schema
        const parseResult = toolDef.schema.safeParse(args);
        if (!parseResult.success) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `INVALID_INPUT: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
              },
            ],
          };
        }

        const validatedInput = parseResult.data;

        // 2. Build argument array
        const cliArgs = toolDef.buildArgs(validatedInput);

        try {
          // 3. Execute mm CLI with --json and safe args
          const result = await executeMmCommand({
            subcommand: toolDef.subcommand,
            args: cliArgs,
            isWrite: toolDef.isWrite,
            mmPath: options?.mmPath,
          });

          // 4. Handle MFA notice or pauses
          if (result.isAwaitingMfa) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `[AWAITING_MFA] ${result.error?.message}\nHint: ${result.error?.hint || "Approve in MetaMask"}`,
                },
              ],
            };
          }

          // 5. Handle errors while preserving plugin error code
          if (!result.ok) {
            const errCode = result.error?.code || "COMMAND_FAILED";
            const errMessage = result.error?.message || "Unknown error";
            const errHint = result.error?.hint ? `\nHint: ${result.error.hint}` : "";
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `${errCode}: ${errMessage}${errHint}`,
                },
              ],
            };
          }

          // 6. Format successful output: structured text summary + JSON data
          const summaryText = toolDef.formatSummary(result.data, validatedInput);
          const jsonText = JSON.stringify(result.data, null, 2);

          return {
            content: [
              {
                type: "text" as const,
                text: `${summaryText}\n\n\`\`\`json\n${jsonText}\n\`\`\``,
              },
            ],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `CLI_EXECUTION_ERROR: ${err.message || String(err)}`,
              },
            ],
          };
        }
      }
    );
  }

  return server;
}
