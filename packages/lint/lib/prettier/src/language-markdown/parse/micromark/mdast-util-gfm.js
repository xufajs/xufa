// There is no way to disable autolink
// Hackly find and replace `gfm-autolink-literal`
// https://github.com/remarkjs/remark-gfm/issues/16#issuecomment-899046315

import { gfmFromMarkdown as originalGfmFromMarkdown } from '../../parser/mdast-util-gfm/index.js';

/**
@import {Extension} from "../../parser/mdast-util-from-markdown/index.js";
*/

/**
@returns {Extension[]}
*/
export function gfmFromMarkdown() {
  const mdastExtensions = originalGfmFromMarkdown();
  const autolinkExtension = mdastExtensions.find((extension) => extension.enter.literalAutolink);

  // Prevent the autolink extension generate nodes without position
  autolinkExtension.transforms = [];

  return mdastExtensions;
}
