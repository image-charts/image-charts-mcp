# image-charts-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that turns an agent's chart request into a **permanent, hosted [Image-Charts](https://www.image-charts.com) image URL**.

The URL renders server-side and embeds anywhere an image does — Markdown, HTML `<img>`, email, Slack, PDF, no-code and low-code tools — with **no chart library and no runtime on the client**. The agent gets back a string; the picture appears wherever that string is dropped.

## Why a URL

Most chart tooling hands an agent raw bytes or an ephemeral in-memory preview that lives and dies inside the session. A hosted URL is different:

- **Persistent** — the same link keeps rendering long after the conversation ends.
- **Portable** — paste it into an email, a Notion page, a Slack message, a PDF, a Jira ticket. It just shows up.
- **Zero-runtime** — the receiving surface needs nothing but the ability to display an image. No JavaScript, no build step, no dependency.
- **Deterministic** — the chart is fully described by the URL, so it is cacheable and reproducible.

## Install

No install step — run it straight from npm:

```bash
npx -y image-charts-mcp
```

## Client configuration

Add the server to your MCP client (Claude Desktop, Claude Code, Cursor, or any MCP-capable host):

```json
{
  "mcpServers": {
    "image-charts": {
      "command": "npx",
      "args": ["-y", "image-charts-mcp"],
      "env": {
        "IMAGE_CHARTS_SECRET": "",
        "IMAGE_CHARTS_HOST": ""
      }
    }
  }
}
```

Both env vars are **optional**:

| Variable | Purpose |
|---|---|
| `IMAGE_CHARTS_SECRET` | Image-Charts Enterprise HMAC signing key. When set together with an account id (`icac`), every URL is signed. Never logged. |
| `IMAGE_CHARTS_HOST` | Image-Charts Dedicated Cloud host (e.g. `charts.acme.com`). URLs point at this host and are never signed. |

Leave them empty for the free, watermarked tier.

## Transports

- **stdio** (default) — what MCP clients use.
- **StreamableHTTP** (stateless) — `npx -y image-charts-mcp --transport http --port 3000`, served at `http://127.0.0.1:3000/mcp`.

## Tools

### `create_chart` — describe a chart, get a URL

High-level, Image-Charts-native description. You pick a semantic `type` and supply data; the server maps it to the correct Image-Charts parameters.

`type` is one of: `bar`, `bar_grouped`, `bar_stacked`, `bar_horizontal`, `line`, `area`, `pie`, `doughnut`, `radar`, `scatter`, `qr`, `graph`, `gauge`.

Common fields: `title`, `series` (`{ name?, data: number[] }`, or `{ name?, points: {x,y}[] }` for scatter), `labels`, `colors` (hex without `#`), `legend` (`true` / `"top"` / `"bottom"` / `"left"` / `"right"`), `size` (`{ width, height }`), plus `qr` / `graph` / `gauge` option objects, `icac`, and `format` (`url` / `png` / `both`).

**Bar chart**

```json
{
  "type": "bar",
  "title": "Quarterly revenue",
  "series": [
    { "name": "EU", "data": [120, 90, 140] },
    { "name": "US", "data": [80, 130, 100] }
  ],
  "labels": ["Q1", "Q2", "Q3"],
  "colors": ["4285F4", "DB4437"],
  "legend": "bottom"
}
```

→ `https://image-charts.com/chart?cht=bvg&chd=a:120,90,140|80,130,100&chs=700x400&chxt=x,y&chxl=0:|Q1|Q2|Q3&chco=4285F4,DB4437&chdl=EU|US&chdlp=b&chtt=Quarterly+revenue`

**Pie chart**

```json
{
  "type": "pie",
  "title": "Traffic sources",
  "series": [{ "data": [40, 35, 25] }],
  "labels": ["Search", "Direct", "Social"],
  "colors": ["4285F4", "0F9D58", "F4B400"]
}
```

→ `https://image-charts.com/chart?cht=p&chd=a:40,35,25&chs=500x400&chl=Search|Direct|Social&chco=4285F4,0F9D58,F4B400&chtt=Traffic+sources`

**QR code**

```json
{
  "type": "qr",
  "qr": { "data": "https://www.image-charts.com", "errorCorrection": "M", "margin": 4 },
  "size": { "width": 300, "height": 300 }
}
```

→ `https://image-charts.com/chart?cht=qr&chl=https://www.image-charts.com&choe=UTF-8&chld=M|4&chs=300x300`

> URLs above are shown decoded for readability; the tool returns them percent-encoded.

### `image_charts_url` — raw parameter passthrough

The escape hatch. Pass raw Image-Charts parameters (`cht`, `chd`, `chs`, `chco`, `chxt`, `chxl`, `chm`, `chbh`, …) and get the hosted URL, signed automatically when applicable. Use it for anything `create_chart` does not cover.

```json
{ "cht": "lc", "chd": "a:10,40,25,60", "chs": "600x300", "chco": "4285F4", "chm": "B,4285F433,0,0,0" }
```

### `list_chart_types` — discovery

Returns every semantic `type`, the Image-Charts `cht` it maps to, a description, the inputs it reads, and the concepts Image-Charts cannot render (funnel, treemap, sankey, heatmap, and so on). Call it first if you are unsure which type to use.

## Enterprise signing

Image-Charts Enterprise requires each URL to carry an HMAC-SHA256 signature. This server handles it for you:

1. Set `IMAGE_CHARTS_SECRET` in the server's environment (it stays server-side and is never logged).
2. Pass your account id as `icac` on `create_chart` or `image_charts_url`.

When both are present the returned URL includes `&ichm=…`:

```
https://image-charts.com/chart?icac=ic_demo_account&cht=bvg&chd=a:1,2,3&chs=700x400&…&ichm=26d6d5b3…
```

If the secret is not configured, a bare `icac` cannot be signed, so it is dropped and you get a valid free-tier URL instead of a broken one. On **Dedicated Cloud** (`IMAGE_CHARTS_HOST`) signing is not used at all — the dedicated host handles authorization at the edge.

## Development

```bash
npm install
npm run build       # tsup → dist/cli.js
npm run typecheck   # tsc --noEmit
npm test            # vitest (black-box, real Image-Charts URL builder, no mocks)
```

## License

MIT
