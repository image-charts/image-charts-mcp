/**
 * Registers the three Image-Charts MCP tools:
 *  - create_chart      — high-level, Image-Charts-native chart description
 *  - image_charts_url  — low-level raw parameter passthrough (ch..., ic...)
 *  - list_chart_types  — discovery of the supported semantic types
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type ImageCharts from 'image-charts';
import { CHART_TYPE_INFO, CHART_TYPE_VALUES, UNSUPPORTED_CONCEPTS } from './chart-types.js';
import { createChartShape, rawParamsShape } from './schemas.js';
import type { CreateChartInput, RawParamsInput } from './schemas.js';
import { buildCreateChart, buildRawUrl, type RuntimeConfig } from './build.js';

const URL_NOTE =
  'This is a permanent, hosted image URL. Embed it directly — Markdown ![](url), HTML <img src>, email, Slack, PDF or any no-code tool. It renders server-side, so no chart library or runtime is needed on the client.';

function urlResult(url: string): CallToolResult {
  return { content: [{ type: 'text', text: url }, { type: 'text', text: URL_NOTE }] };
}

function imageResult(url: string, png: Buffer): CallToolResult {
  return {
    content: [
      { type: 'text', text: url },
      { type: 'text', text: URL_NOTE },
      { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
    ],
  };
}

function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Turn a built chart into a tool result, optionally fetching the rendered PNG. */
function respond(
  built: { chart: ImageCharts; url: string },
  format: 'url' | 'png' | 'both' | undefined,
): CallToolResult | Promise<CallToolResult> {
  if (format === 'png' || format === 'both') {
    return built.chart
      .toBuffer()
      .then((png) => imageResult(built.url, png))
      .catch((err: unknown) => errorResult(err));
  }
  return urlResult(built.url);
}

export function registerTools(server: McpServer, cfg: RuntimeConfig): void {
  server.registerTool(
    'create_chart',
    {
      title: 'Create a hosted chart',
      description:
        'Describe a chart semantically (bar, line, area, pie, doughnut, radar, scatter, qr, graph, gauge, …) and get back a permanent, hosted Image-Charts image URL that renders server-side and embeds anywhere. No client-side chart library required.',
      inputSchema: createChartShape,
    },
    (args: CreateChartInput) => {
      let built;
      try {
        built = buildCreateChart(args, cfg);
      } catch (err) {
        return errorResult(err);
      }
      return respond(built, args.format);
    },
  );

  server.registerTool(
    'image_charts_url',
    {
      title: 'Build a raw Image-Charts URL',
      description:
        'Escape hatch for full control: pass raw Image-Charts parameters (cht, chd, chs, chco, chxt, chxl, chm, …) and get the hosted image URL. Signs the URL automatically when icac is provided and IMAGE_CHARTS_SECRET is set.',
      inputSchema: rawParamsShape,
    },
    (args: RawParamsInput) => {
      let built;
      try {
        built = buildRawUrl(args, cfg);
      } catch (err) {
        return errorResult(err);
      }
      return respond(built, args.format);
    },
  );

  server.registerTool(
    'list_chart_types',
    {
      title: 'List supported chart types',
      description:
        'Discovery: returns every semantic type accepted by create_chart, the Image-Charts `cht` it maps to, a description, and which inputs it reads — plus the concepts Image-Charts cannot render.',
      inputSchema: {},
    },
    (): CallToolResult => {
      const types = CHART_TYPE_VALUES.map((type) => {
        const info = CHART_TYPE_INFO[type];
        return { type, cht: info.cht, description: info.description, expects: info.expects };
      });
      const payload = { types, unsupported: UNSUPPORTED_CONCEPTS };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
