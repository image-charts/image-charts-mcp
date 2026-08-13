/**
 * Pure Image-Charts URL construction. Everything in this module is synchronous
 * and offline: it drives the official `image-charts` builder to produce a hosted
 * chart URL (HMAC-signed when an Enterprise account id + secret are configured).
 * No network calls happen here — that is what makes the output a *permanent* URL.
 */
import ImageCharts from 'image-charts';
import { CHART_TYPE_INFO } from './chart-types.js';
import type { CreateChartInput, RawParamsInput } from './schemas.js';

/** Thrown for cross-field problems zod can't express (e.g. missing series for a bar chart). */
export class InvalidChartRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChartRequest';
  }
}

/**
 * Server runtime configuration, read once from the environment at the process
 * boundary. `host`/`secret` are absent (undefined) when their env var is unset or
 * empty; the secret is never logged.
 */
export interface RuntimeConfig {
  /** Dedicated Cloud host from IMAGE_CHARTS_HOST (e.g. "charts.acme.com"). Absent = image-charts.com. */
  host: string | undefined;
  /** Enterprise HMAC signing key from IMAGE_CHARTS_SECRET. Absent = free / unsigned. */
  secret: string | undefined;
  /** Request timeout (ms) used only by the optional PNG fetch. */
  timeoutMs: number;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const host = env.IMAGE_CHARTS_HOST;
  const secret = env.IMAGE_CHARTS_SECRET;
  return {
    host: typeof host === 'string' && host.length > 0 ? host : undefined,
    secret: typeof secret === 'string' && secret.length > 0 ? secret : undefined,
    timeoutMs: 8000,
  };
}

/** The `image-charts` typings omit `chbh`; reach it through the builder's internal query cloning. */
type ParamSetter = { _clone(param: string, value: string): ImageCharts };
function setParam(chart: ImageCharts, param: string, value: string): ImageCharts {
  return (chart as unknown as ParamSetter)._clone(param, value);
}

const PALETTE = ['4285F4', 'DB4437', 'F4B400', '0F9D58', 'AB47BC', '00ACC1', 'FF7043', '9E9D24'];

function colorAt(colors: string[] | undefined, i: number): string {
  if (colors !== undefined && i < colors.length) {
    return colors[i]!;
  }
  return PALETTE[i % PALETTE.length]!;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function numToken(n: number): string {
  return String(n);
}

/**
 * Build a fresh Image-Charts builder honouring the auth model:
 *  - Dedicated Cloud (custom host) never signs and ignores icac.
 *  - Enterprise signs only when BOTH an account id and a secret are present.
 *  - Otherwise a free / unsigned builder.
 */
function newChart(icac: string | undefined, cfg: RuntimeConfig): ImageCharts {
  if (cfg.host !== undefined) {
    return new ImageCharts({ host: cfg.host, timeout: cfg.timeoutMs });
  }
  if (icac !== undefined && cfg.secret !== undefined) {
    return new ImageCharts({ secret: cfg.secret, timeout: cfg.timeoutMs }).icac(icac);
  }
  return new ImageCharts({ timeout: cfg.timeoutMs });
}

type Series = CreateChartInput['series'];
type SeriesItem = NonNullable<Series>[number];

function requireSeries(input: CreateChartInput): SeriesItem[] {
  if (input.series === undefined || input.series.length === 0) {
    throw new InvalidChartRequest(`Chart type "${input.type}" requires at least one series.`);
  }
  return input.series;
}

function numericGroups(series: SeriesItem[], type: string): number[][] {
  return series.map((s) => {
    if (s.data === undefined || s.data.length === 0) {
      throw new InvalidChartRequest(`Chart type "${type}" needs a non-empty "data" array on every series.`);
    }
    return s.data;
  });
}

/** `a:` awesome encoding — values comma-separated, series pipe-separated. */
function awesomeData(groups: number[][]): string {
  return 'a:' + groups.map((g) => g.map(numToken).join(',')).join('|');
}

/** Scatter data: each series contributes an X group then a Y group. */
function scatterData(series: SeriesItem[]): string {
  const groups: string[] = [];
  for (const s of series) {
    if (s.points === undefined || s.points.length === 0) {
      throw new InvalidChartRequest('Scatter charts need a non-empty "points" array on every series.');
    }
    groups.push(s.points.map((p) => numToken(p.x)).join(','));
    groups.push(s.points.map((p) => numToken(p.y)).join(','));
  }
  return 'a:' + groups.join('|');
}

function sizeStr(input: CreateChartInput, fallback: string): string {
  if (input.size !== undefined) {
    return `${input.size.width}x${input.size.height}`;
  }
  return fallback;
}

function seriesNames(series: SeriesItem[]): string[] {
  const out: string[] = [];
  for (const s of series) {
    if (typeof s.name === 'string' && s.name.length > 0) {
      out.push(s.name);
    }
  }
  return out;
}

function legendPosition(legend: CreateChartInput['legend']): string | undefined {
  switch (legend) {
    case 'top':
      return 't';
    case 'bottom':
      return 'b';
    case 'left':
      return 'l';
    case 'right':
      return 'r';
    default:
      return undefined;
  }
}

function applyLegend(chart: ImageCharts, input: CreateChartInput): ImageCharts {
  if (input.legend === undefined || input.legend === false) {
    return chart;
  }
  let c = chart;
  if (input.series !== undefined) {
    const names = seriesNames(input.series);
    if (names.length > 0) {
      c = c.chdl(names.join('|'));
    }
  }
  const pos = legendPosition(input.legend);
  if (pos !== undefined) {
    c = c.chdlp(pos);
  }
  return c;
}

function applyColors(chart: ImageCharts, input: CreateChartInput): ImageCharts {
  if (input.colors !== undefined && input.colors.length > 0) {
    return chart.chco(input.colors.join(','));
  }
  return chart;
}

function applyTitle(chart: ImageCharts, input: CreateChartInput): ImageCharts {
  if (input.title !== undefined && input.title.length > 0) {
    return chart.chtt(input.title);
  }
  return chart;
}

/** Category axis: index 0 (x) for vertical charts, index 1 (y) for horizontal bars. */
function applyCategoryAxis(chart: ImageCharts, input: CreateChartInput, horizontal: boolean): ImageCharts {
  let c = chart.chxt('x,y');
  if (input.labels !== undefined && input.labels.length > 0) {
    const idx = horizontal ? 1 : 0;
    c = c.chxl(`${idx}:|${input.labels.join('|')}`);
  }
  return c;
}

function computeCht(input: CreateChartInput): string {
  const base = CHART_TYPE_INFO[input.type].cht;
  if (input.type === 'graph' && input.graph !== undefined && input.graph.engine !== undefined) {
    return `gv:${input.graph.engine}`;
  }
  return base;
}

/**
 * Build the hosted Image-Charts URL for a high-level `create_chart` request.
 * Returns both the builder (so an optional PNG fetch can reuse it) and its URL.
 */
export function buildCreateChart(input: CreateChartInput, cfg: RuntimeConfig): { chart: ImageCharts; url: string } {
  let chart = newChart(input.icac, cfg).cht(computeCht(input));

  switch (input.type) {
    case 'bar':
    case 'bar_grouped':
    case 'bar_stacked':
    case 'bar_horizontal': {
      const series = requireSeries(input);
      const horizontal = input.type === 'bar_horizontal';
      chart = chart.chd(awesomeData(numericGroups(series, input.type)));
      chart = chart.chs(sizeStr(input, '700x400'));
      chart = applyCategoryAxis(chart, input, horizontal);
      chart = applyColors(chart, input);
      chart = applyLegend(chart, input);
      break;
    }
    case 'line':
    case 'area': {
      const series = requireSeries(input);
      const groups = numericGroups(series, input.type);
      chart = chart.chd(awesomeData(groups));
      chart = chart.chs(sizeStr(input, '700x400'));
      chart = applyCategoryAxis(chart, input, false);
      chart = applyColors(chart, input);
      chart = applyLegend(chart, input);
      if (input.type === 'area') {
        const fills = groups.map((_, i) => `B,${colorAt(input.colors, i)},${i},0,0`);
        chart = chart.chm(fills.join('|'));
      }
      break;
    }
    case 'pie':
    case 'doughnut': {
      const series = requireSeries(input);
      // A pie is a single flat series of slice values.
      const values = numericGroups(series, input.type)[0]!;
      chart = chart.chd(awesomeData([values]));
      chart = chart.chs(sizeStr(input, '500x400'));
      if (input.labels !== undefined && input.labels.length > 0) {
        chart = chart.chl(input.labels.join('|'));
      }
      chart = applyColors(chart, input);
      chart = applyLegend(chart, input);
      break;
    }
    case 'radar': {
      const series = requireSeries(input);
      chart = chart.chd(awesomeData(numericGroups(series, input.type)));
      chart = chart.chs(sizeStr(input, '500x400'));
      chart = chart.chxt('x,y');
      if (input.labels !== undefined && input.labels.length > 0) {
        chart = chart.chxl(`0:|${input.labels.join('|')}`);
      }
      chart = applyColors(chart, input);
      chart = applyLegend(chart, input);
      break;
    }
    case 'scatter': {
      const series = requireSeries(input);
      chart = chart.chd(scatterData(series));
      chart = chart.chs(sizeStr(input, '600x500'));
      chart = chart.chxt('x,y');
      const markers = series.map((_, i) => `s,${colorAt(input.colors, i)},${i},-1,8`);
      chart = chart.chm(markers.join('|'));
      chart = applyColors(chart, input);
      chart = applyLegend(chart, input);
      break;
    }
    case 'qr': {
      if (input.qr === undefined) {
        throw new InvalidChartRequest('type "qr" requires a "qr" object with a "data" field.');
      }
      const ec = input.qr.errorCorrection ?? 'L';
      const margin = input.qr.margin ?? 4;
      chart = chart.chl(input.qr.data).choe('UTF-8').chld(`${ec}|${margin}`);
      chart = chart.chs(sizeStr(input, '300x300'));
      if (input.colors !== undefined && input.colors.length > 0) {
        chart = chart.icqrf(input.colors[0]!);
      }
      break;
    }
    case 'graph': {
      if (input.graph === undefined) {
        throw new InvalidChartRequest('type "graph" requires a "graph" object with a "dot" field.');
      }
      chart = chart.chl(input.graph.dot);
      chart = chart.chs(sizeStr(input, '500x400'));
      break;
    }
    case 'gauge': {
      if (input.gauge === undefined) {
        throw new InvalidChartRequest('type "gauge" requires a "gauge" object with a "value" field.');
      }
      const max = input.gauge.max ?? (input.gauge.value <= 100 ? 100 : input.gauge.value);
      const value = clamp(input.gauge.value, 0, max);
      const remaining = max - value;
      chart = chart.chd(`a:${numToken(value)}|${numToken(remaining)}`);
      chart = chart.chs(sizeStr(input, '400x120'));
      chart = chart.chco(`${colorAt(input.colors, 0)},EEEEEE`);
      chart = chart.chl(`${numToken(value)}|`);
      break;
    }
    default: {
      // Exhaustiveness guard — every ChartType is handled above.
      const never: never = input.type;
      throw new InvalidChartRequest(`Unsupported chart type: ${String(never)}`);
    }
  }

  chart = applyTitle(chart, input);
  return { chart, url: chart.toURL() };
}

/** Raw params forwarded verbatim, in a stable order, to a typed builder method. */
const RAW_METHOD_PARAMS = [
  'cht',
  'chd',
  'chl',
  'chs',
  'chco',
  'chtt',
  'chts',
  'chxt',
  'chxl',
  'chxr',
  'chxs',
  'chdl',
  'chdlp',
  'chdls',
  'chg',
  'chm',
  'chls',
  'chma',
  'chbr',
  'chf',
  'chli',
  'chan',
  'chds',
  'choe',
  'chld',
  'chof',
  'icqrf',
  'icqrb',
  'icff',
  'icfs',
  'iclocale',
  'icretina',
] as const;

/**
 * Build a hosted URL from raw Image-Charts parameters (the low-level escape
 * hatch). `chbh` is forwarded through the untyped setter; `icac` + secret drive
 * signing exactly like `create_chart`.
 */
export function buildRawUrl(input: RawParamsInput, cfg: RuntimeConfig): { chart: ImageCharts; url: string } {
  let chart = newChart(input.icac, cfg);

  for (const key of RAW_METHOD_PARAMS) {
    const value = input[key];
    if (value !== undefined) {
      const method = chart[key] as (v: string) => ImageCharts;
      chart = method.call(chart, String(value));
    }
  }

  if (input.chbh !== undefined) {
    chart = setParam(chart, 'chbh', input.chbh);
  }

  return { chart, url: chart.toURL() };
}
