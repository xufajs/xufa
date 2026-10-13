/**
 * @typedef {import('../micromark-extension-gfm-footnote/index.js').HtmlOptions} HtmlOptions
 * @typedef {import('../micromark-extension-gfm-strikethrough/index.js').Options} Options
 * @typedef {import('../micromark-util-types/index.js').Extension} Extension
 * @typedef {import('../micromark-util-types/index.js').HtmlExtension} HtmlExtension
 */

import { combineExtensions } from '../micromark-util-combine-extensions/index.js';
import { gfmAutolinkLiteral } from '../micromark-extension-gfm-autolink-literal/index.js';
import { gfmFootnote } from '../micromark-extension-gfm-footnote/index.js';
import { gfmStrikethrough } from '../micromark-extension-gfm-strikethrough/index.js';
import { gfmTable } from '../micromark-extension-gfm-table/index.js';

import { gfmTaskListItem } from '../micromark-extension-gfm-task-list-item/index.js';

/**
 * Create an extension for `micromark` to enable GFM syntax.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 *
 *   Passed to `micromark-extens-gfm-strikethrough`.
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions` to enable GFM
 *   syntax.
 */
export function gfm(options) {
  return combineExtensions([
    gfmAutolinkLiteral(),
    gfmFootnote(),
    gfmStrikethrough(options),
    gfmTable(),
    gfmTaskListItem(),
  ]);
}

/**
 * Create an extension for `micromark` to support GFM when serializing to HTML.
 *
 * @param {HtmlOptions | null | undefined} [options]
 *   Configuration (optional).
 *
 *   Passed to `micromark-extens-gfm-footnote`.
 * @returns {HtmlExtension}
 *   Extension for `micromark` that can be passed in `htmlExtensions` to
 *   support GFM when serializing to HTML.
 */
