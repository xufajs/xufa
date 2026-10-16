// Ported from parse5's packages/parse5/lib/common/unicode.ts by tools/port-parse5/port.js: do not edit, change the tool.
const UNDEFINED_CODE_POINTS = new Set([
    0xff_fe, 0xff_ff, 0x1_ff_fe, 0x1_ff_ff, 0x2_ff_fe, 0x2_ff_ff, 0x3_ff_fe, 0x3_ff_ff, 0x4_ff_fe, 0x4_ff_ff, 0x5_ff_fe,
    0x5_ff_ff, 0x6_ff_fe, 0x6_ff_ff, 0x7_ff_fe, 0x7_ff_ff, 0x8_ff_fe, 0x8_ff_ff, 0x9_ff_fe, 0x9_ff_ff, 0xa_ff_fe,
    0xa_ff_ff, 0xb_ff_fe, 0xb_ff_ff, 0xc_ff_fe, 0xc_ff_ff, 0xd_ff_fe, 0xd_ff_ff, 0xe_ff_fe, 0xe_ff_ff, 0xf_ff_fe,
    0xf_ff_ff, 0x10_ff_fe, 0x10_ff_ff,
]);
export const REPLACEMENT_CHARACTER = '\uFFFD';
export var CODE_POINTS;
(function (CODE_POINTS) {
    CODE_POINTS[CODE_POINTS["EOF"] = -1] = "EOF";
    CODE_POINTS[CODE_POINTS["NULL"] = 0] = "NULL";
    CODE_POINTS[CODE_POINTS["TABULATION"] = 9] = "TABULATION";
    CODE_POINTS[CODE_POINTS["CARRIAGE_RETURN"] = 13] = "CARRIAGE_RETURN";
    CODE_POINTS[CODE_POINTS["LINE_FEED"] = 10] = "LINE_FEED";
    CODE_POINTS[CODE_POINTS["FORM_FEED"] = 12] = "FORM_FEED";
    CODE_POINTS[CODE_POINTS["SPACE"] = 32] = "SPACE";
    CODE_POINTS[CODE_POINTS["EXCLAMATION_MARK"] = 33] = "EXCLAMATION_MARK";
    CODE_POINTS[CODE_POINTS["QUOTATION_MARK"] = 34] = "QUOTATION_MARK";
    CODE_POINTS[CODE_POINTS["AMPERSAND"] = 38] = "AMPERSAND";
    CODE_POINTS[CODE_POINTS["APOSTROPHE"] = 39] = "APOSTROPHE";
    CODE_POINTS[CODE_POINTS["HYPHEN_MINUS"] = 45] = "HYPHEN_MINUS";
    CODE_POINTS[CODE_POINTS["SOLIDUS"] = 47] = "SOLIDUS";
    CODE_POINTS[CODE_POINTS["DIGIT_0"] = 48] = "DIGIT_0";
    CODE_POINTS[CODE_POINTS["DIGIT_9"] = 57] = "DIGIT_9";
    CODE_POINTS[CODE_POINTS["SEMICOLON"] = 59] = "SEMICOLON";
    CODE_POINTS[CODE_POINTS["LESS_THAN_SIGN"] = 60] = "LESS_THAN_SIGN";
    CODE_POINTS[CODE_POINTS["EQUALS_SIGN"] = 61] = "EQUALS_SIGN";
    CODE_POINTS[CODE_POINTS["GREATER_THAN_SIGN"] = 62] = "GREATER_THAN_SIGN";
    CODE_POINTS[CODE_POINTS["QUESTION_MARK"] = 63] = "QUESTION_MARK";
    CODE_POINTS[CODE_POINTS["LATIN_CAPITAL_A"] = 65] = "LATIN_CAPITAL_A";
    CODE_POINTS[CODE_POINTS["LATIN_CAPITAL_Z"] = 90] = "LATIN_CAPITAL_Z";
    CODE_POINTS[CODE_POINTS["RIGHT_SQUARE_BRACKET"] = 93] = "RIGHT_SQUARE_BRACKET";
    CODE_POINTS[CODE_POINTS["GRAVE_ACCENT"] = 96] = "GRAVE_ACCENT";
    CODE_POINTS[CODE_POINTS["LATIN_SMALL_A"] = 97] = "LATIN_SMALL_A";
    CODE_POINTS[CODE_POINTS["LATIN_SMALL_Z"] = 122] = "LATIN_SMALL_Z";
})(CODE_POINTS || (CODE_POINTS = {}));
export const SEQUENCES = {
    DASH_DASH: '--',
    CDATA_START: '[CDATA[',
    DOCTYPE: 'doctype',
    SCRIPT: 'script',
    PUBLIC: 'public',
    SYSTEM: 'system',
};
//Surrogates
export function isSurrogate(cp) {
    return cp >= 0xd8_00 && cp <= 0xdf_ff;
}
export function isSurrogatePair(cp) {
    return cp >= 0xdc_00 && cp <= 0xdf_ff;
}
export function getSurrogatePairCodePoint(cp1, cp2) {
    return (cp1 - 0xd8_00) * 0x4_00 + 0x24_00 + cp2;
}
//NOTE: excluding NULL and ASCII whitespace
export function isControlCodePoint(cp) {
    return ((cp !== 0x20 && cp !== 0x0a && cp !== 0x0d && cp !== 0x09 && cp !== 0x0c && cp >= 0x01 && cp <= 0x1f) ||
        (cp >= 0x7f && cp <= 0x9f));
}
export function isUndefinedCodePoint(cp) {
    return (cp >= 0xfd_d0 && cp <= 0xfd_ef) || UNDEFINED_CODE_POINTS.has(cp);
}
