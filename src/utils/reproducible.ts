// Reproducible output — the pinned creation instant (v1.5.0, pdfnative 1.8.0).
//
// Unencrypted pdfnative output is a pure function of its inputs plus the
// creation date: /Info /CreationDate, xmp:CreateDate, the {date} header and
// footer placeholder and the trailer /ID (an MD5 over title + creation date +
// object count) all derive from it, and since pdfnative 1.8.0 every date is
// written in UTC (+00'00'), so the same instant yields the same bytes on
// every host. Pinning it makes a render byte-identical across machines and
// runs — the property CI, caches and content-addressed pipelines rely on.
//
// Precedence, highest first:
//   1. --creation-date <iso8601>  (global flag; also from .pdfnativerc.json)
//   2. layout.creationDate in the document JSON or a --layout file
//   3. SOURCE_DATE_EPOCH            (reproducible-builds.org: integer seconds)
//   4. the wall clock               (historical behaviour, byte-identical to 1.4.0)
//
// The flag and the env var become the process-wide default
// (setDefaultCreationDate), which covers every render in a `batch --manifest`
// run; the flag is additionally written into layout.creationDate so the
// documented rule "flags win over the layout file" holds. Signing time
// (`sign --signing-time`), `metadata --mod-date` and document timestamps are
// deliberately NOT covered: those instants have a legal meaning of their own.

import type { ParsedArgs } from './args.js';
import { getStringFlag } from './args.js';
import { CliError } from './error.js';

export interface ReproducibleDate {
    readonly date: Date;
    readonly source: 'flag' | 'env';
}

/** Parse an ISO 8601 instant; anything `Date` cannot parse is a usage error. */
export function parseIsoDate(raw: string, flag: string): Date {
    const trimmed = raw.trim();
    const date = new Date(trimmed);
    if (trimmed.length === 0 || Number.isNaN(date.getTime())) {
        throw new CliError(
            `Invalid --${flag} "${raw}". Expected an ISO 8601 instant (e.g. 2026-01-01T00:00:00Z).`,
            2,
        );
    }
    return date;
}

/**
 * Parse SOURCE_DATE_EPOCH: a non-negative integer number of seconds since the
 * Unix epoch (https://reproducible-builds.org/specs/source-date-epoch/). An
 * invalid value is a usage error rather than silently ignored — silently
 * falling back to the wall clock would defeat the convention.
 */
export function parseSourceDateEpoch(raw: string): Date {
    const trimmed = raw.trim();
    if (!/^\d{1,12}$/.test(trimmed)) {
        throw new CliError(
            `Invalid SOURCE_DATE_EPOCH "${raw}". Expected a non-negative integer number of seconds since 1970-01-01T00:00:00Z.`,
            2,
        );
    }
    return new Date(Number.parseInt(trimmed, 10) * 1000);
}

/**
 * Resolve the pinned instant from the flag, then the environment. Returns
 * undefined when neither is set (the engine then stamps the wall clock).
 */
export function resolveReproducibleDate(
    flags: ParsedArgs['flags'],
    env: NodeJS.ProcessEnv = process.env,
): ReproducibleDate | undefined {
    const flag = getStringFlag(flags, 'creation-date');
    if (flag !== undefined) return { date: parseIsoDate(flag, 'creation-date'), source: 'flag' };
    const epoch = env.SOURCE_DATE_EPOCH;
    if (epoch !== undefined && epoch.trim().length > 0) {
        return { date: parseSourceDateEpoch(epoch), source: 'env' };
    }
    return undefined;
}
