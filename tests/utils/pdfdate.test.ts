import { describe, it, expect } from 'vitest';
import { pdfDateToIso } from '../../src/utils/pdfdate.js';

describe('pdfDateToIso (inspect --iso-dates)', () => {
    it('converts a full PDF date with a UTC offset', () => {
        expect(pdfDateToIso("D:20260101000000+00'00'")).toBe('2026-01-01T00:00:00Z');
        expect(pdfDateToIso("D:20260615123045+02'00'")).toBe('2026-06-15T12:30:45+02:00');
        expect(pdfDateToIso("D:20260615123045-05'30'")).toBe('2026-06-15T12:30:45-05:30');
        expect(pdfDateToIso('D:20260615123045Z')).toBe('2026-06-15T12:30:45Z');
    });

    it('fills the optional fields', () => {
        expect(pdfDateToIso('D:2026')).toBe('2026-01-01T00:00:00Z');
        expect(pdfDateToIso('D:202606')).toBe('2026-06-01T00:00:00Z');
        expect(pdfDateToIso('D:2026061512')).toBe('2026-06-15T12:00:00Z');
    });

    it('returns anything it cannot parse untouched', () => {
        for (const raw of ['', 'yesterday', 'D:2026-06-15', 'D:20261345000000Z', "D:20260615123045+25'00'", "D:20260615123045+"]) {
            expect(pdfDateToIso(raw)).toBe(raw);
        }
    });
});
