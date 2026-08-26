// Chart-block coverage for pdfnative 1.7.0 (charts v2): all nine chart
// types, positional (linear/time) x-axes, log scales, dual value axes,
// data labels, and label rotation — driven end-to-end through the CLI
// `render` command.

import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { render } from '../../src/commands/render.js';
import { parseArgs } from '../../src/utils/args.js';
import { CliError, ErrorCode } from '../../src/utils/error.js';
import { openPdf } from '../../src/core-bridge/index.js';

const tmp: string[] = [];

afterEach(async () => {
    for (const f of tmp.splice(0)) {
        await fs.rm(f, { force: true }).catch(() => undefined);
    }
});

function tmpPath(name: string): string {
    const p = path.join(os.tmpdir(), `render-charts-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
    tmp.push(p);
    return p;
}

async function writeDoc(blocks: readonly unknown[]): Promise<string> {
    const p = tmpPath('in.json');
    await fs.writeFile(p, JSON.stringify({ blocks }), 'utf8');
    return p;
}

/** Render `blocks` and return the output PDF bytes after basic validation. */
async function renderBlocks(blocks: readonly unknown[]): Promise<Buffer> {
    const input = await writeDoc(blocks);
    const out = tmpPath('out.pdf');
    await render(parseArgs(['--input', input, '--output', out]));
    const bytes = await fs.readFile(out);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(bytes.toString('latin1')).toContain('%%EOF');
    return bytes;
}

const CATEGORIES = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const SERIES_A = { label: 'North', values: [12, 19, 7, 15] };
const SERIES_B = { label: 'South', values: [8, 11, 14, 9] };

/** Minimal valid chart block per type (scatter needs a positional x-axis). */
function chartBlockFor(chartType: string): Record<string, unknown> {
    if (chartType === 'pie' || chartType === 'donut') {
        return {
            type: 'chart', chartType,
            categories: ['A', 'B', 'C'],
            series: [{ label: 'Share', values: [50, 30, 20] }],
        };
    }
    if (chartType === 'scatter') {
        return {
            type: 'chart', chartType,
            xAxis: { type: 'linear' },
            series: [{ label: 'Points', values: [3, 7, 4, 9], xValues: [1, 2, 5, 8] }],
        };
    }
    return {
        type: 'chart', chartType,
        categories: [...CATEGORIES],
        series: [SERIES_A, SERIES_B],
    };
}

describe('render chart blocks — all nine chart types (pdfnative 1.7.0)', () => {
    const ALL_TYPES = [
        'bar', 'barH', 'line', 'pie', 'donut',
        'stackedBar', 'stackedBarH', 'area', 'scatter',
    ] as const;

    for (const chartType of ALL_TYPES) {
        it(`renders a valid single-page PDF for chartType "${chartType}"`, async () => {
            const bytes = await renderBlocks([
                { type: 'heading', text: `Chart: ${chartType}`, level: 1 },
                chartBlockFor(chartType),
            ]);
            const reader = openPdf(new Uint8Array(bytes));
            expect(reader.pageCount).toBe(1);
        });
    }
});

describe('render chart blocks — charts v2 options', () => {
    it('scatter with numeric xValues on a linear x-axis', async () => {
        await renderBlocks([{
            type: 'chart', chartType: 'scatter',
            title: 'Latency vs load',
            xAxis: { type: 'linear', min: 0, max: 100, grid: true },
            series: [
                { label: 'p50', values: [12, 15, 22, 40], xValues: [10, 30, 60, 90] },
                { label: 'p99', values: [30, 44, 71, 120], xValues: [10, 30, 60, 90] },
            ],
        }]);
    });

    it('line with a log value-axis scale (strictly positive values)', async () => {
        await renderBlocks([{
            type: 'chart', chartType: 'line',
            categories: ['a', 'b', 'c', 'd'],
            axis: { scale: 'log' },
            series: [{ label: 'Growth', values: [1, 10, 100, 1000] }],
        }]);
    });

    it('secondary right axis via series yAxis + axis2', async () => {
        await renderBlocks([{
            type: 'chart', chartType: 'line',
            categories: [...CATEGORIES],
            axis: { grid: true },
            axis2: { yMin: 0, yMax: 100, ticks: 5 },
            series: [
                SERIES_A,
                { label: 'Utilisation %', values: [55, 61, 48, 72], yAxis: 'right' },
            ],
        }]);
    });

    it('dataLabels: bare boolean and customised prefix/suffix/decimals', async () => {
        await renderBlocks([
            {
                type: 'chart', chartType: 'bar',
                categories: [...CATEGORIES],
                series: [SERIES_A],
                dataLabels: true,
            },
            {
                type: 'chart', chartType: 'bar',
                categories: [...CATEGORIES],
                series: [SERIES_B],
                dataLabels: { decimals: 1, prefix: '$', suffix: 'M' },
            },
        ]);
    });

    it('time x-axis with ISO-8601 xValues', async () => {
        await renderBlocks([{
            type: 'chart', chartType: 'line',
            xAxis: { type: 'time', grid: true },
            series: [{
                label: 'Signups',
                values: [5, 9, 14, 11],
                xValues: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'],
            }],
        }]);
    });

    it('labelRotation renders rotated category labels', async () => {
        await renderBlocks([{
            type: 'chart', chartType: 'bar',
            categories: ['January 2026', 'February 2026', 'March 2026', 'April 2026'],
            labelRotation: 45,
            series: [SERIES_A],
        }]);
    });

    it('log scale with non-positive values → CliError E_INPUT (exit 1)', async () => {
        // pdfnative throws `chart: series "…" has non-positive values on a log
        // axis`; the CLI maps `chart:` build errors to E_INPUT / exit 1.
        const input = await writeDoc([{
            type: 'chart', chartType: 'line',
            categories: ['a', 'b'],
            axis: { scale: 'log' },
            series: [{ label: 'Bad', values: [0, 10] }],
        }]);
        const err = await render(parseArgs(['--input', input, '--output', tmpPath('x.pdf')]))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CliError);
        expect((err as CliError).exitCode).toBe(1);
        expect((err as CliError).code).toBe(ErrorCode.INPUT);
        expect((err as CliError).message).toContain('log');
    });
});
