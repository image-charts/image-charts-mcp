/**
 * Assembles the Image-Charts MCP server: an McpServer instance with the three
 * chart tools registered against the resolved runtime configuration.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import { readRuntimeConfig, type RuntimeConfig } from './build.js';

/** Keep in sync with package.json "version". */
export const SERVER_VERSION = '1.0.1';

export function createServer(cfg: RuntimeConfig = readRuntimeConfig()): McpServer {
  const server = new McpServer({
    name: 'image-charts-mcp',
    version: SERVER_VERSION,
  });
  registerTools(server, cfg);
  return server;
}
