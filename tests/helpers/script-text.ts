// Short native-script strings, one per bundled script code, for the render
// suites. The text is demonstration content by nature and comes from the
// engine's vetted language documents (pdfnative 1.8.0
// `scripts/data/language-docs-data.ts`, same author and licence); `ja` and `zh`
// use the statement titles of its financial samples. Every record is keyed by
// its language code, which is its language label.
//
// tests/commands/render-scripts.test.ts holds the key set to SCRIPT_CODES.

/** One string per script code of `src/utils/fonts.ts` SCRIPT_CODES. */
export const SCRIPT_TEXT: Readonly<Record<string, string>> = {
    ar: 'كتاب مكتبة بيت عين', // Arabic — Contextual forms
    hy: 'Հայաստան Երևան հայերեն ՀԱՅԵՐԵՆ', // Armenian — Lowercase and capitals
    bn: 'কর্ম ধর্ম বর্ণ সূর্য', // Bengali — Reph
    ru: 'ёж йод щука объём цирк', // Russian — Russian letters
    hi: 'हिन्दी विकिपीडिया किताब', // Hindi — i-matra reordered
    am: 'ሀ ሁ ሂ ሃ ሄ ህ ሆ', // Amharic — Seven vowel orders
    ka: 'საქართველო თბილისი ქართული ენა', // Georgian — Mkhedruli
    el: 'ά έ ή ί ό ύ ώ Ά Έ Ή Ί Ό Ύ Ώ', // Greek — Tonos on every vowel
    he: 'כ/ך מ/ם נ/ן פ/ף צ/ץ שלום', // Hebrew — Final forms
    ja: '月次口座明細書', // Japanese — statement title
    km: 'ស្ត្រី ក្រុម ខ្មែរ', // Khmer — Coeng stacks
    ko: '한국어 안녕하세요 감사합니다', // Korean — Precomposed syllables
    my: 'အင်္ဂလိပ်', // Burmese — Kinzi
    pl: 'ą ę Ą Ę wąż węże', // Polish — Ogonek
    zh: '月度账户对账单', // Chinese — statement title
    si: 'කෙ කේ කෛ දේශය', // Sinhala — Kombuva
    ta: 'விலை நிலை தமிழ் கிளி', // Tamil — i-matra to the right of its base
    te: 'ప్రదర్శన సంయుక్తాక్షరాల', // Telugu — Subjoined consonants
    th: 'ตั้ง สิ่ง ที่ นี่ ปั้น', // Thai — Tone mark over a vowel
    bo: 'བསྒྲུབས སྐད རྒྱ', // Tibetan — Subjoined stacks
    tr: 'İstanbul ılık İZMİR ısı IŞIK', // Turkish — Dotted and dotless i
    vi: 'a à á ả ã ạ — e è é ẻ ẽ ẹ', // Vietnamese — Six tones on one vowel
    lo: 'ເອກະສານ ແປ ໂຕ ໃຈ ໄທ', // Lao — Leading vowels
    nod: 'ᨠ᩠ᨠ ᨲ᩠ᩅ ᩉ᩠ᨶ᩶ᩣ ᨾ᩠ᨿ', // Northern Thai — Sakot stacks
    khb: 'ᦂᦱ ᦂᦲ ᦂᦳ ᦂᦴ ᦂᦸ ᦂᦹ', // Tai Lue — Spacing vowels after the consonant
    tdd: 'ᥐᥣ ᥐᥤ ᥐᥥ ᥐᥦ ᥐᥧ ᥐᥨ ᥐᥩ ᥐᥪ ᥐᥫ', // Tai Nüa — Consonant and vowel letters
    cjm: 'ꨀꨯ ꨀꨰ ꨆꨯ ꨓꨯꨩ ꨟꨯꨱ', // Cham — Pre-base vowels
};

/** Inputs aimed at a shaping fix of pdfnative 1.8.0: `[script code, text]`. */
export const SHAPING_PROBES = {
    hiConjuncts: ['hi', 'क्ष ज्ञ त्र द्य श्र क्त'], // Devanagari conjuncts (one glyph for several letters)
    hiReph: ['hi', 'प्रदर्शन समर्थन कर्म पूर्ण'], // Devanagari reph
    bnReph: ['bn', 'কর্ম ধর্ম বর্ণ সূর্য'], // Bengali reph
    taPreBase: ['ta', 'விலை நிலை தமிழ் கிளி'], // Tamil i-matra (1.8.0: drawn on the wrong side)
    thSaraAm: ['th', 'น้ำ ทำ จำนวน'], // Thai sara am under a tone mark
    loSaraAm: ['lo', 'ນ້ຳ ຄຳ ທຳ ຈຳ'], // Lao sara am under a tone mark
    kmCoeng: ['km', 'ស្ត្រី ក្រុម ខ្មែរ'], // Khmer subscript consonants
    myKinzi: ['my', 'အင်္ဂလိပ်'], // Myanmar kinzi
    arContextual: ['ar', 'كتاب مكتبة بيت عين'], // Arabic contextual forms
    plOgonek: ['pl', 'ą ę Ą Ę wąż węże'], // Polish ogonek letters
    trDotless: ['tr', 'İstanbul ılık İZMİR ısı IŞIK'], // Turkish dotted / dotless i
    viStacked: ['vi', 'ấ ầ ẩ ẫ ậ ế ề ể ễ ệ ố ồ ổ ỗ ộ'], // Vietnamese stacked diacritics
    koFinals: ['ko', '읽다 흙 값 없다 앉다 젊다 뚫다'], // Hangul complex finals
} as const satisfies Record<string, readonly [string, string]>;
