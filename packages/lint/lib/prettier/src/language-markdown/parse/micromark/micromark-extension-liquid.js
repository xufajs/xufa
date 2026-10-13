import { markdownLineEnding, markdownSpace } from '../../parser/micromark-util-character/index.js';
import { codes, types } from '../../parser/micromark-util-symbol/lib/default.js';

/**
 * @typedef {import('../../parser/mdast-util-from-markdown/index.js').Extension} FromMarkdownExtension
 * @typedef {import('../../parser/mdast-util-from-markdown/index.js').Token} Token
 * @typedef {import('../../parser/mdast-util-from-markdown/index.js').CompileContext} CompileContext
 * @typedef {import('../../parser/mdast-util-from-markdown/index.js').Handle} Handle
 * @typedef {import('../../parser/micromark-util-types/index.js').State} State
 * @typedef {import('../../parser/micromark-util-types/index.js').TokenizeContext} TokenizeContext
 */

const nodeType = 'liquidNode';

/**
 * @returns {FromMarkdownExtension}
 */
function liquidFromMarkdown() {
  return {
    canContainEols: [nodeType],
    enter: { [nodeType]: enter },
    exit: { [nodeType]: exit },
  };

  /** @type {Handle} */
  function enter(token) {
    this.enter(
      // @ts-expect-error
      { type: nodeType },
      token
    );
    this.buffer();
  }

  /** @type {Handle} */
  function exit(token) {
    this.resume();
    /** @type {any} */
    const node = this.stack.at(-1);
    node.value = this.sliceSerialize(token);
    this.exit(token);
  }
}

/**
 * @returns {import('../../parser/micromark-util-types/index.js').Extension}
 */
function liquidSyntax() {
  return {
    flow: {
      [codes.leftCurlyBrace]: {
        name: 'liquidFlow',
        tokenize: tokenizeFlow,
      },
    },
    text: {
      [codes.leftCurlyBrace]: {
        name: 'liquidText',
        tokenize: tokenizeText,
      },
    },
  };

  /** @this {TokenizeContext} */
  function tokenizeFlow(effects, ok, nok) {
    return tokenize.call(this, effects, ok, nok, 'flow');
  }

  /** @this {TokenizeContext} */
  function tokenizeText(effects, ok, nok) {
    return tokenize.call(this, effects, ok, nok, 'text');
  }

  /**
   * @this {TokenizeContext}
   * @param mode {"text" | "flow"}
   */
  function tokenize(effects, ok, nok, mode) {
    const isFlow = mode === 'flow';
    const { now, parser } = this;
    /** @type {typeof codes.rightCurlyBrace | typeof codes.percentSign} */
    let closingCode;

    return start;

    /** @type {State} */
    function start(code) {
      effects.enter('liquidNode');
      effects.enter(types.data);
      effects.consume(code);
      return function (code) {
        switch (code) {
          case codes.percentSign:
          case codes.leftCurlyBrace:
            closingCode = code === codes.percentSign ? codes.percentSign : codes.rightCurlyBrace;
            effects.consume(code);
            return inside;
          default:
            return nok(code);
        }
      };
    }

    /** @type {State} */
    function inside(code) {
      switch (code) {
        case closingCode:
          effects.consume(code);
          return mayClose;
        case codes.eof:
          return nok(code);
        default:
          if (markdownLineEnding(code)) {
            effects.exit(types.data);
            effects.enter(types.lineEnding);
            effects.consume(code);
            effects.exit(types.lineEnding);
            if (isFlow) {
              return afterLineEnding;
            }
            effects.enter(types.data);
            return inside;
          }
          effects.consume(code);
          return inside;
      }
    }

    /** @type {State} */
    function afterLineEnding(code) {
      if (parser.lazy[now().line]) {
        return nok(code);
      }

      if (markdownLineEnding(code)) {
        effects.enter(types.lineEnding);
        effects.consume(code);
        effects.exit(types.lineEnding);
        return afterLineEnding;
      }

      effects.enter(types.data);
      return inside(code);
    }

    /** @type {State} */
    function mayClose(code) {
      if (code === codes.rightCurlyBrace) {
        effects.consume(code);
        effects.exit(types.data);
        effects.exit(nodeType);
        return isFlow ? afterClose : ok;
      }

      return inside;
    }

    /** @type {State} */
    function afterClose(code) {
      if (markdownSpace(code)) {
        effects.enter(types.whitespace);
        effects.consume(code);
        return afterWhitespace;
      }

      return after(code);
    }

    /** @type {State} */
    function afterWhitespace(code) {
      if (markdownSpace(code)) {
        effects.consume(code);
        return afterWhitespace;
      }

      effects.exit(types.whitespace);
      return after(code);
    }

    /** @type {State} */
    function after(code) {
      return code === codes.eof || markdownLineEnding(code) ? ok(code) : nok(code);
    }
  }
}

export { liquidFromMarkdown, liquidSyntax };
