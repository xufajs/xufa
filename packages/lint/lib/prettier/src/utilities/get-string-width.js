// @xufa/lint: the width of text in columns, as prettier counts it: emoji 2 (but narrow ones 1), east asian Fullwidth
// and Wide characters 2, control and combining characters and variation selectors 0, the rest 1; ambiguous widths
// are narrow.
import { EMOJI, FULLWIDTH_RANGES, NARROW_EMOJI, WIDE_RANGES } from './unicode-data.js';

// Whether a code point is in a sorted list of [start, end] pairs (binary search).
function inRanges(ranges, codePoint) {
  let low = 0;
  let high = (ranges.length >> 1) - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = ranges[middle * 2];
    if (codePoint < start) {
      high = middle - 1;
    } else if (codePoint > ranges[middle * 2 + 1]) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} text
 * @returns {number}
 */
function getStringWidth(text) {
  if (!text) {
    return 0;
  }

  // ASCII: one column each. (A loop: most texts are short, where a regular expression costs more.)
  let ascii = true;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code > 0x7f) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    return text.length;
  }

  let width = 0;
  text = text.replace(EMOJI, (character) => {
    width += NARROW_EMOJI.has(character) ? 1 : 2;
    return '';
  });

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x300 && codePoint <= 0x36f) ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    ) {
      continue;
    }
    width += inRanges(FULLWIDTH_RANGES, codePoint) || inRanges(WIDE_RANGES, codePoint) ? 2 : 1;
  }

  return width;
}

export default getStringWidth;
