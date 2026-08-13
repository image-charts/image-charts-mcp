/**
 * Image-Charts MCP entrypoint.
 *
 *   image-charts-mcp                     # stdio transport (default)
 *   image-charts-mcp --transport http    # StreamableHTTP (stateless) on :3000/mcp
 *   image-charts-mcp --transport http --port 8080
 *
 * All logging goes to stderr — stdout is reserved for the stdio MCP protocol.
 * The IMAGE_CHARTS_SECRET env var is never logged.
 */
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

function startStdio(): void {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    console.error('[image-charts-mcp] fatal:', err);
    process.exitCode = 1;
  });
}

function startHttp(port: number): void {
  Promise.all([import('node:http'), import('@modelcontextprotocol/sdk/server/streamableHttp.js')])
    .then(([http, mod]) => {
      const httpServer = http.createServer((req, res) => {
        if (typeof req.url !== 'string' || !req.url.startsWith('/mcp')) {
          res.writeHead(404).end('Not found');
          return;
        }
        // Stateless: a fresh server + transport per request (sessionIdGenerator undefined).
        const server = createServer();
        const transport = new mod.StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        server
          .connect(transport)
          .then(() => transport.handleRequest(req, res))
          .catch((err: unknown) => {
            console.error('[image-charts-mcp] http error:', err);
            if (!res.headersSent) {
              res.writeHead(500).end();
            }
          });
      });
      httpServer.listen(port, () => {
        console.error(`[image-charts-mcp] StreamableHTTP listening on http://127.0.0.1:${port}/mcp`);
      });
    })
    .catch((err: unknown) => {
      console.error('[image-charts-mcp] fatal:', err);
      process.exitCode = 1;
    });
}

function main(): void {
  const { values } = parseArgs({
    options: {
      transport: { type: 'string', default: 'stdio' },
      port: { type: 'string', default: '3000' },
    },
    allowPositionals: true,
  });

  if (values.transport === 'http') {
    const port = Number.parseInt(values.port ?? '3000', 10);
    startHttp(Number.isFinite(port) && port > 0 ? port : 3000);
    return;
  }
  startStdio();
}

main();
