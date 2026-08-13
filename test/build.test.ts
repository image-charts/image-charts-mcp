/**
 * Black-box tests for the URL builders. They drive the REAL `image-charts` SDK
 * (no mocks) and run fully offline — only URL strings are produced, never HTTP.
 * Input always goes through the same zod schema the MCP tool uses.
 */
import { describe, it, expect } from 'vitest';
import { createChartObject, rawParamsObject } from '../src/schemas.js';
import { buildCreateChart, buildRawUrl, type RuntimeConfig } from '../src/build.js';
import { CHART_TYPE_VALUES, CHART_TYPE_INFO } from '../src/chart-types.js';

const FREE: RuntimeConfig = { host: undefined, secret: undefined, timeoutMs: 8000 };

function create(input: unknown, cfg: RuntimeConfig = FREE): string {
  return buildCreateChart(createChartObject.parse(input), cfg).url;
}
function raw(input: unknown, cfg: RuntimeConfig = FREE): string {
  return buildRawUrl(rawParamsObject.parse(input), cfg).url;
}
/** Params are percent-encoded in the final URL; decode to assert on readable tokens. */
const dec = (u: string): string => decodeURIComponent(u);

describe('create_chart — chart type mapping', () => {
  it('bar → cht=bvg and awesome-encoded data', () => {
    const url = create({ type: 'bar', series: [{ data: [1, 2, 3] }], labels: ['A', 'B', 'C'] });
    expect(url).toContain('cht=bvg');
    expect(dec(url)).toContain('chd=a:1,2,3');
    expect(dec(url)).toContain('chxl=0:|A|B|C');
    expect(url.startsWith('https://image-charts.com/chart?')).toBe(true);
  });

  it('bar_stacked → cht=bvs', () => {
    expect(create({ type: 'bar_stacked', series: [{ data: [1, 2] }, { data: [3, 4] }] })).toContain('cht=bvs');
  });

  it('bar_horizontal → cht=bhg and category labels on the y axis (index 1)', () => {
    const url = create({ type: 'bar_horizontal', series: [{ data: [1, 2] }], labels: ['x', 'y'] });
    expect(url).toContain('cht=bhg');
    expect(dec(url)).toContain('chxl=1:|x|y');
  });

  it('line → cht=lc with x,y axes', () => {
    const url = create({ type: 'line', series: [{ data: [1, 2, 3] }] });
    expect(url).toContain('cht=lc');
    expect(dec(url)).toContain('chxt=x,y');
  });

  it('area → cht=lc with a chm area fill', () => {
    const url = create({ type: 'area', series: [{ data: [1, 2, 3] }], colors: ['FF0000'] });
    expect(url).toContain('cht=lc');
    expect(dec(url)).toContain('chm=B,FF0000,0,0,0');
  });

  it('pie → cht=p, single flat data series, slice labels', () => {
    const url = create({ type: 'pie', series: [{ data: [40, 30, 30] }], labels: ['A', 'B', 'C'] });
    expect(url).toContain('cht=p');
    expect(dec(url)).toContain('chd=a:40,30,30');
    expect(dec(url)).toContain('chl=A|B|C');
  });

  it('doughnut → cht=pd', () => {
    expect(create({ type: 'doughnut', series: [{ data: [1, 2] }] })).toContain('cht=pd');
  });

  it('radar → cht=r', () => {
    expect(create({ type: 'radar', series: [{ data: [1, 2, 3] }], labels: ['a', 'b', 'c'] })).toContain('cht=r');
  });

  it('scatter → cht=lxy with x/y groups and point markers', () => {
    const url = create({
      type: 'scatter',
      series: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
    });
    expect(url).toContain('cht=lxy');
    expect(dec(url)).toContain('chd=a:1,3|2,4');
    expect(dec(url)).toContain('chm=s,');
  });

  it('qr → cht=qr with UTF-8 encoding and error-correction', () => {
    const url = create({ type: 'qr', qr: { data: 'https://image-charts.com' } });
    expect(url).toContain('cht=qr');
    expect(dec(url)).toContain('choe=UTF-8');
    expect(dec(url)).toContain('chld=L|4');
  });

  it('qr → foreground color from colors[0]', () => {
    const url = create({ type: 'qr', qr: { data: 'x' }, colors: ['FF0000'] });
    expect(url).toContain('icqrf=FF0000');
  });

  it('graph → cht=gv with DOT payload; engine appends :engine', () => {
    expect(create({ type: 'graph', graph: { dot: 'graph{a--b}' } })).toContain('cht=gv');
    const url = create({ type: 'graph', graph: { dot: 'digraph{a->b}', engine: 'neato' } });
    expect(dec(url)).toContain('cht=gv:neato');
  });

  it('gauge → cht=bhs with value|remaining data', () => {
    const url = create({ type: 'gauge', gauge: { value: 65 } });
    expect(url).toContain('cht=bhs');
    expect(dec(url)).toContain('chd=a:65|35');
  });

  it('every semantic type maps to its documented cht value', () => {
    const minimal: Record<string, unknown> = {};
    for (const type of CHART_TYPE_VALUES) {
      const input: Record<string, unknown> = { type };
      if (type === 'qr') input.qr = { data: 'x' };
      else if (type === 'graph') input.graph = { dot: 'graph{a--b}' };
      else if (type === 'gauge') input.gauge = { value: 10 };
      else if (type === 'scatter') input.series = [{ points: [{ x: 1, y: 1 }] }];
      else input.series = [{ data: [1, 2] }];
      minimal[type] = input;
      const url = create(input);
      const expectedCht = CHART_TYPE_INFO[type].cht;
      expect(url).toContain(`cht=${expectedCht}`);
    }
  });
});

describe('create_chart — styling', () => {
  it('title, colors and legend are emitted', () => {
    const url = create({
      type: 'bar',
      title: 'Q1 revenue',
      series: [{ name: 'EU', data: [1, 2] }, { name: 'US', data: [3, 4] }],
      colors: ['4285F4', 'DB4437'],
      legend: 'bottom',
    });
    expect(url).toContain('chtt=Q1+revenue'); // spaces are form-encoded as +
    expect(url).toContain('chco=4285F4%2CDB4437');
    expect(dec(url)).toContain('chdl=EU|US');
    expect(url).toContain('chdlp=b');
  });

  it('honours an explicit size', () => {
    expect(create({ type: 'bar', series: [{ data: [1] }], size: { width: 320, height: 240 } })).toContain('chs=320x240');
  });
});

describe('enterprise signing', () => {
  it('signs (&ichm=) when icac is provided AND a secret is configured', () => {
    const cfg: RuntimeConfig = { host: undefined, secret: 'dummy-secret', timeoutMs: 8000 };
    const url = create({ type: 'bar', series: [{ data: [1, 2, 3] }], icac: 'MY_ACCOUNT' }, cfg);
    expect(url).toContain('icac=MY_ACCOUNT');
    expect(url).toContain('&ichm=');
  });

  it('does NOT sign when the secret is missing, and drops the unsignable icac', () => {
    // A bare icac with no ichm is a broken Enterprise URL; without a secret we
    // fall back to a valid free-tier URL instead of emitting a dangling icac.
    const url = create({ type: 'bar', series: [{ data: [1] }], icac: 'MY_ACCOUNT' }, FREE);
    expect(url).not.toContain('ichm=');
    expect(url).not.toContain('icac=');
  });

  it('does NOT sign when icac is absent even if a secret is set', () => {
    const cfg: RuntimeConfig = { host: undefined, secret: 'dummy-secret', timeoutMs: 8000 };
    expect(create({ type: 'bar', series: [{ data: [1] }] }, cfg)).not.toContain('ichm=');
  });

  it('Dedicated Cloud host is used and never signs (ignores icac)', () => {
    const cfg: RuntimeConfig = { host: 'charts.acme.com', secret: 'dummy-secret', timeoutMs: 8000 };
    const url = create({ type: 'bar', series: [{ data: [1] }], icac: 'MY_ACCOUNT' }, cfg);
    expect(url.startsWith('https://charts.acme.com/chart?')).toBe(true);
    expect(url).not.toContain('ichm=');
    expect(url).not.toContain('icac=');
  });
});

describe('image_charts_url — raw passthrough', () => {
  it('forwards raw params verbatim', () => {
    const url = raw({ cht: 'bvg', chd: 'a:1,2,3', chs: '700x200', chco: 'FF0000' });
    expect(url).toContain('cht=bvg');
    expect(dec(url)).toContain('chd=a:1,2,3');
    expect(url).toContain('chs=700x200');
    expect(url).toContain('chco=FF0000');
  });

  it('forwards chbh (absent from the SDK typings) through the passthrough setter', () => {
    const url = raw({ cht: 'bvg', chd: 'a:1,2', chs: '300x200', chbh: '20,4,8' });
    expect(dec(url)).toContain('chbh=20,4,8');
  });

  it('signs the raw URL when icac + secret are present', () => {
    const cfg: RuntimeConfig = { host: undefined, secret: 'dummy-secret', timeoutMs: 8000 };
    const url = raw({ cht: 'p', chd: 'a:1,2,3', icac: 'ACC' }, cfg);
    expect(url).toContain('&ichm=');
  });
});
