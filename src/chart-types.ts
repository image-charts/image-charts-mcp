/**
 * The chart "type" vocabulary exposed by the high-level `create_chart` tool,
 * and how each maps to an Image-Charts `cht` value.
 *
 * This is the single source of truth: the zod enum, the discovery tool and the
 * URL builder all read from here.
 */

export const CHART_TYPE_VALUES = [
  'bar',
  'bar_grouped',
  'bar_stacked',
  'bar_horizontal',
  'line',
  'area',
  'pie',
  'doughnut',
  'radar',
  'scatter',
  'qr',
  'graph',
  'gauge',
] as const;

export type ChartType = (typeof CHART_TYPE_VALUES)[number];

export const CHART_TYPES: readonly ChartType[] = CHART_TYPE_VALUES;

export interface ChartTypeInfo {
  /** The Image-Charts `cht` value this semantic type maps to. */
  cht: string;
  /** One-line, agent-facing description. */
  description: string;
  /** Which `create_chart` inputs this type reads. */
  expects: string;
}

export const CHART_TYPE_INFO: Record<ChartType, ChartTypeInfo> = {
  bar: {
    cht: 'bvg',
    description: 'Vertical bar chart (single or multi-series).',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  bar_grouped: {
    cht: 'bvg',
    description: 'Grouped vertical bars, one cluster per label.',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  bar_stacked: {
    cht: 'bvs',
    description: 'Stacked vertical bars.',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  bar_horizontal: {
    cht: 'bhg',
    description: 'Horizontal bar chart.',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  line: {
    cht: 'lc',
    description: 'Line chart.',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  area: {
    cht: 'lc',
    description: 'Filled area chart (line with area fill under the curve).',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  pie: {
    cht: 'p',
    description: 'Pie chart.',
    expects: 'series[].data (first series), labels (slice labels), colors, legend, title, size',
  },
  doughnut: {
    cht: 'pd',
    description: 'Doughnut chart with an optional center total label.',
    expects: 'series[].data (first series), labels (slice labels), colors, legend, title, size',
  },
  radar: {
    cht: 'r',
    description: 'Radar / spider chart.',
    expects: 'series[].data, labels, colors, legend, title, size',
  },
  scatter: {
    cht: 'lxy',
    description: 'Scatter plot from explicit x/y points.',
    expects: 'series[].points ({x,y}), colors, legend, title, size',
  },
  qr: {
    cht: 'qr',
    description: 'QR code.',
    expects: 'qr.data, qr.errorCorrection, qr.margin, colors[0] (foreground), size',
  },
  graph: {
    cht: 'gv',
    description: 'GraphViz graph rendered from DOT source.',
    expects: 'graph.dot, graph.engine, size',
  },
  gauge: {
    cht: 'bhs',
    description: 'Single-value gauge (rendered as a stacked horizontal bar).',
    expects: 'gauge.value, gauge.max, colors[0], title, size',
  },
};

/** Image-Charts concepts that have no native rendering — `create_chart` rejects these. */
export const UNSUPPORTED_CONCEPTS: readonly string[] = [
  'native gauge (approximated here with a stacked horizontal bar)',
  'funnel',
  'treemap',
  'sankey',
  'candlestick / OHLC',
  'heatmap',
  'boxplot',
  'waterfall',
  'gantt',
  '3D pie',
  'choropleth / geographic map',
  'interactivity / tooltips (output is a static image)',
];
