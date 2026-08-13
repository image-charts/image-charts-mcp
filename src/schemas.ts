/**
 * Zod input schemas for the Image-Charts MCP tools.
 *
 * Every field is bounded (length / range / enum) so the server never forwards an
 * unbounded string or number to the Image-Charts API. The high-level
 * `create_chart` shape is Image-Charts-native and designed here from scratch; the
 * low-level `image_charts_url` shape is a bounded passthrough of raw `ch*`/`ic*`
 * parameters.
 */
import { z } from 'zod';
import { CHART_TYPE_VALUES } from './chart-types.js';

/** Hex color WITHOUT a leading `#` — 3, 6 or 8 hex digits (RGB / RRGGBB / RRGGBBAA). */
export const hexColor = z
  .string()
  .regex(
    /^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    'Hex color without leading # (RGB, RRGGBB or RRGGBBAA)',
  );

/** `<width>x<height>` used by the raw passthrough tool. */
const chsString = z
  .string()
  .regex(/^[1-9][0-9]{0,3}x[1-9][0-9]{0,3}$/, 'Size must be <width>x<height>, e.g. 700x400');

const seriesSchema = z
  .object({
    name: z.string().min(1).max(200).optional().describe('Legend label for this series.'),
    data: z
      .array(z.number().finite())
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Numeric values for this series (bar, line, area, pie, doughnut, radar, gauge). Auto-scaled by Image-Charts. Use this for every type except scatter.',
      ),
    points: z
      .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
      .min(1)
      .max(200)
      .optional()
      .describe('X/Y points — scatter charts only.'),
  })
  .describe('A single data series.');

/**
 * High-level, Image-Charts-native chart description. Exposed as the `create_chart`
 * tool input.
 */
export const createChartShape = {
  type: z
    .enum(CHART_TYPE_VALUES)
    .describe(
      'Semantic chart type. Call list_chart_types for the full catalog and the Image-Charts `cht` each maps to.',
    ),
  title: z.string().max(500).optional().describe('Title drawn above the chart.'),
  series: z
    .array(seriesSchema)
    .min(1)
    .max(50)
    .optional()
    .describe(
      'One or more data series. Required for every type except qr and graph. Use `data` for numeric series, `points` for scatter.',
    ),
  labels: z
    .array(z.string().max(200))
    .max(200)
    .optional()
    .describe(
      'Category / slice labels: x-axis ticks for bar & line, slice labels for pie & doughnut, axis labels for radar. An empty string skips one label.',
    ),
  colors: z
    .array(hexColor)
    .max(50)
    .optional()
    .describe('Hex colors WITHOUT a leading #, one per series (or per slice for pie/doughnut).'),
  legend: z
    .union([z.boolean(), z.enum(['top', 'bottom', 'left', 'right'])])
    .optional()
    .describe('Show a legend built from series names. true = right side; or pick a side explicitly.'),
  size: z
    .object({
      width: z.number().int().min(1).max(999),
      height: z.number().int().min(1).max(999),
    })
    .refine((s) => s.width * s.height <= 998001, {
      message: 'width * height must be <= 998001 pixels',
    })
    .optional()
    .describe(
      'Pixel size. Each side <= 999 and width*height <= 998001. Sensible per-type defaults are used when omitted (e.g. 700x400 for bar/line, 300x300 for qr).',
    ),
  qr: z
    .object({
      data: z.string().min(1).max(4296).describe('Text or URL to encode.'),
      errorCorrection: z
        .enum(['L', 'M', 'Q', 'H'])
        .optional()
        .describe('Error-correction level (default L).'),
      margin: z.number().int().min(0).max(100).optional().describe('Quiet-zone margin in modules (default 4).'),
    })
    .optional()
    .describe('QR-code options (type = qr).'),
  graph: z
    .object({
      dot: z.string().min(1).max(8000).describe('GraphViz DOT source, e.g. "graph{a--b--c}".'),
      engine: z
        .enum(['dot', 'neato', 'fdp', 'twopi', 'circo'])
        .optional()
        .describe('Layout engine (default dot).'),
    })
    .optional()
    .describe('GraphViz options (type = graph).'),
  gauge: z
    .object({
      value: z.number().finite().describe('Current value.'),
      max: z.number().finite().positive().optional().describe('Maximum value (default 100).'),
    })
    .optional()
    .describe('Gauge options (type = gauge).'),
  icac: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      'Image-Charts Enterprise account id. When the IMAGE_CHARTS_SECRET env var is also set, the URL is HMAC-SHA256 signed (&ichm=…). Ignored on Dedicated Cloud (IMAGE_CHARTS_HOST).',
    ),
  format: z
    .enum(['url', 'png', 'both'])
    .optional()
    .describe(
      'url (default) returns only the hosted URL; png also fetches the rendered PNG; both returns the URL and the image.',
    ),
};

export const createChartObject = z.object(createChartShape);
export type CreateChartInput = z.infer<typeof createChartObject>;

/**
 * Low-level escape hatch — raw Image-Charts URL parameters. Every param is
 * optional and bounded. `ichm` is intentionally absent: the signature is always
 * computed by the server from `icac` + IMAGE_CHARTS_SECRET.
 */
export const rawParamsShape = {
  cht: z.string().max(100).optional().describe('Chart type, e.g. bvg, bvs, lc, p, pd, r, lxy, qr, gv.'),
  chd: z.string().max(16000).optional().describe('Chart data, e.g. "a:1,2,3|4,5,6".'),
  chl: z.string().max(8000).optional().describe('Labels (bar/pie/slice) or QR/GraphViz payload.'),
  chs: chsString.optional().describe('Size <width>x<height>.'),
  chco: z.string().max(2000).optional().describe('Series/element colors (hex, comma & pipe separated).'),
  chtt: z.string().max(500).optional().describe('Chart title.'),
  chts: z.string().max(200).optional().describe('Title color,size[,align,family,style].'),
  chxt: z.string().max(100).optional().describe('Visible axes, e.g. "x,y".'),
  chxl: z.string().max(4000).optional().describe('Custom axis labels, e.g. "0:|A|B|C".'),
  chxr: z.string().max(500).optional().describe('Axis ranges, e.g. "0,0,100".'),
  chxs: z.string().max(1000).optional().describe('Axis label styles.'),
  chdl: z.string().max(2000).optional().describe('Legend labels, e.g. "A|B|C".'),
  chdlp: z.string().max(50).optional().describe('Legend position (r/l/t/b).'),
  chdls: z.string().max(50).optional().describe('Legend color,size.'),
  chg: z.string().max(100).optional().describe('Grid lines.'),
  chm: z.string().max(4000).optional().describe('Compound markers, line fills, value labels.'),
  chls: z.string().max(200).optional().describe('Line thickness/dash style.'),
  chma: z.string().max(100).optional().describe('Chart margins.'),
  chbh: z.string().max(50).optional().describe('Bar width/spacing (not in the SDK typings; forwarded verbatim).'),
  chbr: z.string().max(20).optional().describe('Bar corner radius.'),
  chf: z.string().max(500).optional().describe('Background / gradient fill.'),
  chli: z.string().max(200).optional().describe('Doughnut inside label.'),
  chan: z.string().max(100).optional().describe('Animation (renders a GIF).'),
  chds: z.string().max(500).optional().describe('Custom data scaling.'),
  choe: z.string().max(20).optional().describe('QR data encoding (UTF-8).'),
  chld: z.string().max(50).optional().describe('QR error-correction|margin, e.g. "L|4".'),
  chof: z.enum(['.png', '.svg', '.gif']).optional().describe('Output extension hint.'),
  icqrf: hexColor.optional().describe('QR foreground color.'),
  icqrb: hexColor.optional().describe('QR background color.'),
  icff: z.string().max(100).optional().describe('Google Font family (Enterprise).'),
  icfs: z.enum(['normal', 'italic']).optional().describe('Default font style.'),
  iclocale: z.string().max(10).optional().describe('Locale (ISO 639-1).'),
  icretina: z.enum(['1']).optional().describe('Retina mode (Enterprise).'),
  icac: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Enterprise account id; signs the URL when IMAGE_CHARTS_SECRET is set.'),
  format: z
    .enum(['url', 'png', 'both'])
    .optional()
    .describe('url (default), png (also fetch image), or both.'),
};

export const rawParamsObject = z.object(rawParamsShape);
export type RawParamsInput = z.infer<typeof rawParamsObject>;
