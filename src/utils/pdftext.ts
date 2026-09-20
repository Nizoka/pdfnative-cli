// PDF text strings (ISO 32000-1 §7.9.2.2) as pdfnative's reader hands them
// over: one char per byte. With a byte-order mark the value is UTF-16BE —
// what pdfnative writes for any string outside Latin-1, an em dash in a title
// is enough — or UTF-8 (PDF 2.0); without one the bytes are the text.
//
// Presentation only: `inspect` and `compare` decode /Info values with it.
// Undecoded, the NUL bytes of UTF-16 read as control characters.

const UTF16_BOM = String.fromCharCode(0xFE, 0xFF);
const UTF8_BOM = String.fromCharCode(0xEF, 0xBB, 0xBF);

/** Decode a byte-per-char PDF text string to the text it carries. */
export function decodePdfTextString(raw: string): string {
    const bytes = (from: number): Uint8Array => Uint8Array.from(raw.slice(from), (ch) => ch.charCodeAt(0) & 0xFF);
    if (raw.startsWith(UTF16_BOM)) return new TextDecoder('utf-16be').decode(bytes(2));
    if (raw.startsWith(UTF8_BOM)) return new TextDecoder('utf-8').decode(bytes(3));
    return raw;
}
