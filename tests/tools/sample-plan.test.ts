// The sample plan (scripts/lib/sample-plan.ts): one table drives the
// reproducible corpus, so it is held to the samples tree here.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    planRenderJobs, CATEGORY_FLAGS, FILE_FLAGS, SKIP_FILES, SKIP_CATEGORIES, ENV_PINNED_FILES, PASSWORDS,
} from '../../scripts/lib/sample-plan.js';
import { ENCRYPTED_SAMPLES, IDENTICAL_SAMPLE_GROUPS } from '../../scripts/lib/sample-fingerprint.js';

const ROOT = process.cwd();
const RENDER_DIR = join(ROOT, 'samples', 'render');
const jobs = planRenderJobs({ renderDir: RENDER_DIR, outputDir: join(ROOT, 'test-output', 'samples'), creationDate: '2026-01-01T00:00:00.000Z' });

describe('sample plan', () => {
    it('discovers every renderable JSON under samples/render (skips listed)', () => {
        const expected: string[] = [];
        for (const category of readdirSync(RENDER_DIR)) {
            if (SKIP_CATEGORIES.has(category)) continue;
            const dir = join(RENDER_DIR, category);
            for (const f of readdirSync(dir)) if (f.endsWith('.json') && !SKIP_FILES.has(f)) expected.push(`${category}/${f}`);
        }
        expect(jobs.map((j) => `${j.category}/${j.file}`).sort()).toEqual(expected.sort());
        expect(jobs.length).toBeGreaterThan(50);
    });

    it('every FILE_FLAGS and ENV_PINNED_FILES key names a file that exists', () => {
        const files = new Set(jobs.map((j) => j.file));
        for (const f of [...Object.keys(FILE_FLAGS), ...ENV_PINNED_FILES]) expect(files.has(f), f).toBe(true);
    });

    it('every CATEGORY_FLAGS key names a category that exists', () => {
        for (const c of Object.keys(CATEGORY_FLAGS)) expect(existsSync(join(RENDER_DIR, c)), c).toBe(true);
    });

    it('pins --creation-date on every render except the SOURCE_DATE_EPOCH proof', () => {
        for (const j of jobs) {
            const pinned = j.args.includes('--creation-date');
            expect(pinned, `${j.category}/${j.file}`).toBe(!ENV_PINNED_FILES.has(j.file));
        }
    });

    it('fills the absolute paths of the attachment payload and the PDF/X profile', () => {
        const attachment = jobs.find((j) => j.category === 'attachments');
        expect(attachment?.args.join(' ')).toContain('invoice.xml:application/xml:Source');
        const pdfx = jobs.find((j) => j.file === '05-pdfx4.json');
        expect(pdfx?.args).toContain('--output-intent-icc');
        expect(existsSync(join(RENDER_DIR, 'print', 'synthetic-cmyk.icc'))).toBe(true);
    });

    it('routes the encryption category through the deterministic passwords', () => {
        const enc = jobs.filter((j) => j.category === 'encryption');
        expect(enc.length).toBeGreaterThan(0);
        for (const j of enc) expect(j.env).toEqual({ PDFNATIVE_ENCRYPT_OWNER_PASS: PASSWORDS.owner, PDFNATIVE_ENCRYPT_USER_PASS: PASSWORDS.user });
        for (const j of enc) expect(ENCRYPTED_SAMPLES, `${j.file} must be fingerprinted semantically`).toHaveProperty(`encryption/${j.file.replace(/\.json$/, '.pdf')}`);
    });

    it('never renders the driver documents or the outline tree through the plain CLI pass', () => {
        for (const f of ['03-thai.json', '04-multilingual.json', '02-outline-tree.json']) expect(SKIP_FILES.has(f)).toBe(true);
    });

    it('a --category filter narrows the plan', () => {
        const only = planRenderJobs({ renderDir: RENDER_DIR, outputDir: '/o', creationDate: 'x', category: 'typography' });
        expect(only.length).toBeGreaterThan(0);
        expect(only.every((j) => j.category === 'typography')).toBe(true);
    });

    it('the reproducible pair is listed as intentionally identical', () => {
        expect(IDENTICAL_SAMPLE_GROUPS).toContainEqual(['reproducible/01-pinned-date.pdf', 'reproducible/02-source-date-epoch.pdf']);
    });
});
