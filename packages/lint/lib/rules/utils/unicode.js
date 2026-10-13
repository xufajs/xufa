// Kinds of characters that make one with those around them: combining marks, emoji modifiers (skin tones), regional
// indicators (flags), surrogate pairs.

const COMBINING = /^[\p{Mc}\p{Me}\p{Mn}]$/u;

const isCombiningCharacter = (codePoint) => COMBINING.test(String.fromCodePoint(codePoint));
const isEmojiModifier = (code) => code >= 0x1f3fb && code <= 0x1f3ff;
const isRegionalIndicatorSymbol = (code) => code >= 0x1f1e6 && code <= 0x1f1ff;
const isSurrogatePair = (lead, tail) => lead >= 0xd800 && lead < 0xdc00 && tail >= 0xdc00 && tail < 0xe000;

export { isCombiningCharacter, isEmojiModifier, isRegionalIndicatorSymbol, isSurrogatePair };
