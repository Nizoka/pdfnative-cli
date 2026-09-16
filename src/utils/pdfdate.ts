// PDF date strings (ISO 32000-1 §7.9.4) → ISO 8601, for `inspect --iso-dates`
// (v1.5.0, ROADMAP "inspect — ISO 8601 date normalisation").
//
// A PDF date is `D:YYYYMMDDHHmmSSOHH'mm'` where everything after the year is
// optional and O is Z, + or -. The conversion is lossless for well-formed
// values; anything else is returned untouched so a caller never loses the
// raw string (an agent can still see what the file actually carries).

const PDF_DATE = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(?:(\d{2})'?)?)?)?$/;

/** Convert `D:20260101120000+02'00'` to `2026-01-01T12:00:00+02:00`; unparsable input is returned as is. */
export function pdfDateToIso(raw: string): string {
    const m = PDF_DATE.exec(raw.trim());
    if (m === null) return raw;
    const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00', sign, offH, offM = '00'] = m;
    const mo = Number(month);
    const d = Number(day);
    const h = Number(hour);
    const mi = Number(minute);
    const s = Number(second);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return raw;
    let zone = 'Z';
    if (sign === '+' || sign === '-') {
        if (offH === undefined) return raw;
        if (Number(offH) > 23 || Number(offM) > 59) return raw;
        zone = Number(offH) === 0 && Number(offM) === 0 ? 'Z' : `${sign}${offH}:${offM}`;
    }
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`;
}
