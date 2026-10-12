import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { localTools, invokeTool } from "./tools.mjs";
export async function serveStdio(client) {
  const server = new McpServer({
    name: `abei-creator-${client.profile}`,
    version: "0.1.0",
  });
  for (const t of localTools(client))
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.schema,
        annotations: {
          readOnlyHint: t.read,
          destructiveHint: !t.read,
          idempotentHint: !t.name.startsWith("creator_login"),
          openWorldHint: false,
        },
      },
      async (args, extra) => {
        try {
          const result = await invokeTool(t, args, extra.signal);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: { result },
          };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text", text: e.message ?? "操作未完成" }],
          };
        }
      },
    );
  await server.connect(new StdioServerTransport());
  return server;
}
