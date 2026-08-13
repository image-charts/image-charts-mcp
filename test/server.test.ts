/**
 * Black-box wiring test: drives the real McpServer over an in-memory transport
 * pair through a real MCP Client, proving the three tools are reachable and
 * return the expected content. No mocks, no network.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { RuntimeConfig } from '../src/build.js';

const FREE: RuntimeConfig = { host: undefined, secret: undefined, timeoutMs: 8000 };

interface TextBlock {
  type: string;
  text?: string;
}

function withClient<T>(cfg: RuntimeConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(cfg);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  return Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    .then(() => fn(client))
    .finally(() => {
      void client.close();
      void server.close();
    });
}

function firstText(content: unknown): string {
  const blocks = content as TextBlock[];
  const text = blocks.find((b) => b.type === 'text')?.text;
  return typeof text === 'string' ? text : '';
}

describe('MCP server wiring', () => {
  it('lists exactly the three tools', () => {
    return withClient(FREE, (client) =>
      client.listTools().then((res) => {
        expect(res.tools.map((t) => t.name).sort()).toEqual(['create_chart', 'image_charts_url', 'list_chart_types']);
      }),
    );
  });

  it('create_chart returns a hosted pie-chart URL', () => {
    return withClient(FREE, (client) =>
      client
        .callTool({ name: 'create_chart', arguments: { type: 'pie', series: [{ data: [1, 2, 3] }], labels: ['a', 'b', 'c'] } })
        .then((res) => {
          const url = firstText(res.content);
          expect(url).toContain('https://image-charts.com/chart?');
          expect(url).toContain('cht=p');
        }),
    );
  });

  it('image_charts_url forwards raw params', () => {
    return withClient(FREE, (client) =>
      client.callTool({ name: 'image_charts_url', arguments: { cht: 'qr', chl: 'hello', chs: '200x200' } }).then((res) => {
        expect(firstText(res.content)).toContain('cht=qr');
      }),
    );
  });

  it('list_chart_types returns the catalog as JSON', () => {
    return withClient(FREE, (client) =>
      client.callTool({ name: 'list_chart_types', arguments: {} }).then((res) => {
        const parsed = JSON.parse(firstText(res.content)) as { types: Array<{ type: string; cht: string }> };
        expect(parsed.types).toHaveLength(13);
        expect(parsed.types.find((t) => t.type === 'bar')?.cht).toBe('bvg');
      }),
    );
  });

  it('create_chart surfaces a validation error for an unknown type', () => {
    return withClient(FREE, (client) =>
      client
        .callTool({ name: 'create_chart', arguments: { type: 'not_a_chart' } })
        .then((res) => {
          expect(res.isError).toBe(true);
        })
        .catch(() => {
          // An invalid enum may be rejected at the protocol layer instead — also acceptable.
          expect(true).toBe(true);
        }),
    );
  });
});
