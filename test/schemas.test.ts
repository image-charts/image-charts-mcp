/**
 * Black-box tests for input validation / bounds. Confirms the schema rejects
 * out-of-range sizes, malformed hex colors and over-long payloads, and that
 * cross-field build errors surface cleanly.
 */
import { describe, it, expect } from 'vitest';
import { createChartObject } from '../src/schemas.js';
import { buildCreateChart, InvalidChartRequest, type RuntimeConfig } from '../src/build.js';

const FREE: RuntimeConfig = { host: undefined, secret: undefined, timeoutMs: 8000 };

describe('size bounds', () => {
  it('rejects a side larger than 999', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], size: { width: 1200, height: 100 } })).toThrow();
  });

  it('rejects a height larger than 999', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], size: { width: 100, height: 1200 } })).toThrow();
  });

  it('accepts the maximum valid size 999x999 (=998001 px, the area cap)', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], size: { width: 999, height: 999 } })).not.toThrow();
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], size: { width: 500, height: 500 } })).not.toThrow();
  });
});

describe('color validation', () => {
  it('rejects a hex color with a leading #', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], colors: ['#FF0000'] })).toThrow();
  });

  it('rejects a non-hex color', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], colors: ['red'] })).toThrow();
  });

  it('accepts 3, 6 and 8 digit hex colors', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: [1] }], colors: ['F00', 'FF0000', 'FF0000AA'] })).not.toThrow();
  });
});

describe('numeric data validation', () => {
  it('rejects non-numeric series data', () => {
    expect(() => createChartObject.parse({ type: 'bar', series: [{ data: ['x'] }] })).toThrow();
  });
});

describe('qr bounds', () => {
  it('rejects QR payloads longer than 4296 chars', () => {
    expect(() => createChartObject.parse({ type: 'qr', qr: { data: 'a'.repeat(4297) } })).toThrow();
  });
});

describe('cross-field build errors', () => {
  it('bar without a series throws InvalidChartRequest', () => {
    const input = createChartObject.parse({ type: 'bar' });
    expect(() => buildCreateChart(input, FREE)).toThrow(InvalidChartRequest);
  });

  it('scatter with numeric data (no points) throws InvalidChartRequest', () => {
    const input = createChartObject.parse({ type: 'scatter', series: [{ data: [1, 2, 3] }] });
    expect(() => buildCreateChart(input, FREE)).toThrow(InvalidChartRequest);
  });
});
