/**
 * @typedef {import('hast').Element} HastElement
 * @typedef {import('hast').ElementContent} HastElementContent
 * @typedef {import('../../mdast-util-from-markdown/index.js').CompileContext} CompileContext
 * @typedef {import('../../mdast-util-from-markdown/index.js').Extension} FromMarkdownExtension
 * @typedef {import('../../mdast-util-from-markdown/index.js').Handle} FromMarkdownHandle
 * @typedef {import('../../mdast-util-to-markdown/index.js').Handle} ToMarkdownHandle
 * @typedef {import('../../mdast-util-to-markdown/index.js').Options} ToMarkdownExtension
 * @typedef {import('../index.js').InlineMath} InlineMath
 * @typedef {import('../index.js').Math} Math
 *
 * @typedef ToOptions
 *   Configuration.
 * @property {boolean | null | undefined} [singleDollarTextMath=true]
 *   Whether to support math (text) with a single dollar (default: `true`).
 *
 *   Single dollars work in Pandoc and many other places, but often interfere
 *   with “normal” dollars in text.
 *   If you turn this off, you can still use two or more dollars for text math.
 */

import { ok as assert } from '../../devlop/lib/default.js';

/**
 * Create an extension for `mdast-util-from-markdown`.
 *
 * @returns {FromMarkdownExtension}
 *   Extension for `mdast-util-from-markdown`.
 */
export function mathFromMarkdown() {
  return {
    enter: {
      mathFlow: enterMathFlow,
      mathFlowFenceMeta: enterMathFlowMeta,
      mathText: enterMathText,
    },
    exit: {
      mathFlow: exitMathFlow,
      mathFlowFence: exitMathFlowFence,
      mathFlowFenceMeta: exitMathFlowMeta,
      mathFlowValue: exitMathData,
      mathText: exitMathText,
      mathTextData: exitMathData,
    },
  };

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathFlow(token) {
    /** @type {HastElement} */
    const code = {
      type: 'element',
      tagName: 'code',
      properties: { className: ['language-math', 'math-display'] },
      children: [],
    };
    this.enter(
      {
        type: 'math',
        meta: null,
        value: '',
        data: { hName: 'pre', hChildren: [code] },
      },
      token
    );
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathFlowMeta() {
    this.buffer();
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlowMeta() {
    const data = this.resume();
    const node = this.stack[this.stack.length - 1];
    assert(node.type === 'math');
    node.meta = data;
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlowFence() {
    // Exit if this is the closing fence.
    if (this.data.mathFlowInside) return;
    this.buffer();
    this.data.mathFlowInside = true;
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlow(token) {
    const data = this.resume().replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, '');
    const node = this.stack[this.stack.length - 1];
    assert(node.type === 'math');
    this.exit(token);
    node.value = data;
    // @ts-expect-error: we defined it in `enterMathFlow`.
    const code = /** @type {HastElement} */ (node.data.hChildren[0]);
    assert(code.type === 'element');
    assert(code.tagName === 'code');
    code.children.push({ type: 'text', value: data });
    this.data.mathFlowInside = undefined;
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathText(token) {
    this.enter(
      {
        type: 'inlineMath',
        value: '',
        data: {
          hName: 'code',
          hProperties: { className: ['language-math', 'math-inline'] },
          hChildren: [],
        },
      },
      token
    );
    this.buffer();
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathText(token) {
    const data = this.resume();
    const node = this.stack[this.stack.length - 1];
    assert(node.type === 'inlineMath');
    this.exit(token);
    node.value = data;
    const children = /** @type {Array<HastElementContent>} */ (
      // @ts-expect-error: we defined it in `enterMathFlow`.
      node.data.hChildren
    );
    children.push({ type: 'text', value: data });
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathData(token) {
    this.config.enter.data.call(this, token);
    this.config.exit.data.call(this, token);
  }
}

/**
 * Create an extension for `mdast-util-to-markdown`.
 *
 * @param {ToOptions | null | undefined} [options]
 *   Configuration (optional).
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown`.
 */
