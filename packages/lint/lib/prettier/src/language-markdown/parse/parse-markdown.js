import { fromMarkdown as wikiLinkFromMarkdown } from '../parser/@braindb/mdast-util-wiki-link/dist/index.js';
import { syntax as wikiLinkSyntax } from '../parser/@braindb/micromark-extension-wiki-link/dist/index.js';
import { fromMarkdown } from '../parser/mdast-util-from-markdown/index.js';
import { mathFromMarkdown } from '../parser/mdast-util-math/index.js';
import { gfm as gfmSyntax } from '../parser/micromark-extension-gfm/index.js';
import { math as mathSyntax } from '../parser/micromark-extension-math/index.js';
import parseFrontMatter from '../../main/front-matter/parse.js';
import { gfmFromMarkdown } from './micromark/mdast-util-gfm.js';
import { overrideHtmlTextSyntax } from './micromark/micromark-extension-html-text.js';
import { liquidFromMarkdown, liquidSyntax } from './micromark/micromark-extension-liquid.js';

let markdownParseOptions;
function getMarkdownParseOptions() {
  return (markdownParseOptions ??= {
    extensions: [
      gfmSyntax({ singleTilde: false }),
      mathSyntax({ singleDollarTextMath: false }),
      wikiLinkSyntax({
        // We don't need support alias, use a fake string to bypass
        // https://github.com/stereobooster/braindb/blob/66d6cf74d0bad43f20924a14e382a432ff81cdfa/packages/micromark-extension-wiki-link/src/syntax.ts#L81
        // @ts-expect-error -- expected
        aliasDivider: { charCodeAt: () => Number.NaN },
      }),
      liquidSyntax(),
      overrideHtmlTextSyntax(),
    ],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown(), wikiLinkFromMarkdown(), liquidFromMarkdown()],
  });
}

function parseMarkdown(text) {
  const { frontMatter, content } = parseFrontMatter(text);
  const ast = fromMarkdown(content, getMarkdownParseOptions());

  if (frontMatter) {
    const [start, end] = [frontMatter.start, frontMatter.end].map(({ line, column, index }) => ({
      line,
      column: column + 1,
      offset: index,
    }));

    ast.children.unshift({
      ...frontMatter,
      // @ts-expect-error -- Expected
      type: 'frontMatter',
      position: { start, end },
    });
  }

  return ast;
}

export { parseMarkdown };
