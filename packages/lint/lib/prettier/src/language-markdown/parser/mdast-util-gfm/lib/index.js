/**
 * @import {Extension as FromMarkdownExtension} from '../../mdast-util-from-markdown/index.js'
 * @import {Options} from '../index.js'
 * @import {Options as ToMarkdownExtension} from '../../mdast-util-to-markdown/index.js'
 */

import { gfmAutolinkLiteralFromMarkdown } from '../../mdast-util-gfm-autolink-literal/index.js';
import { gfmFootnoteFromMarkdown } from '../../mdast-util-gfm-footnote/index.js';
import { gfmStrikethroughFromMarkdown } from '../../mdast-util-gfm-strikethrough/index.js';
import { gfmTableFromMarkdown } from '../../mdast-util-gfm-table/index.js';
import { gfmTaskListItemFromMarkdown } from '../../mdast-util-gfm-task-list-item/index.js';

/**
 * Create an extension for `mdast-util-from-markdown` to enable GFM (autolink
 * literals, footnotes, strikethrough, tables, tasklists).
 *
 * @returns {Array<FromMarkdownExtension>}
 *   Extension for `mdast-util-from-markdown` to enable GFM (autolink literals,
 *   footnotes, strikethrough, tables, tasklists).
 */
export function gfmFromMarkdown() {
  return [
    gfmAutolinkLiteralFromMarkdown(),
    gfmFootnoteFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  ];
}

/**
 * Create an extension for `mdast-util-to-markdown` to enable GFM (autolink
 * literals, footnotes, strikethrough, tables, tasklists).
 *
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown` to enable GFM (autolink literals,
 *   footnotes, strikethrough, tables, tasklists).
 */
