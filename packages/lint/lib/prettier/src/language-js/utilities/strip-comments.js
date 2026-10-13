import { commentsPropertyInOptions } from '../../constants.js';
import { getOrInsertComputed } from '../../utilities/get-or-insert.js';
import replaceNonLineBreaksWithSpace from '../../utilities/replace-non-line-breaks-with-space.js';
import { locEnd, locStart } from '../location/index.js';

/**
@import {Node, Comment} from "../types/estree.js"
@typedef {Comment[]} Comments
@typedef {{
  originalText: string,
  [commentsPropertyInOptions]: Comments
}} Options
*/

/**
@param {string} text
@param {Comments} comments
@returns {string}
*/
function stripCommentsFromText(text, comments) {
  // (In one pass: the text was made again for each comment, which took long on files with many.)
  const ranges = comments.map((comment) => [locStart(comment), locEnd(comment)]).sort((a, b) => a[0] - b[0]);
  const parts = [];
  let last = 0;
  for (let [start, end] of ranges) {
    // (Comments in comments: blanked once.)
    start = Math.max(start, last);
    if (end <= start) {
      continue;
    }
    parts.push(text.slice(last, start), replaceNonLineBreaksWithSpace(text.slice(start, end)));
    last = end;
  }
  parts.push(text.slice(last));

  return parts.join('');
}

/** @type {WeakMap<Comment[], string>} */
const cache = new WeakMap();

/**
@param {Options} options
@returns {string}
*/
function stripComments(options) {
  const comments = options[commentsPropertyInOptions];
  return getOrInsertComputed(cache, comments, (comments) => stripCommentsFromText(options.originalText, comments));
}

export { stripComments };
