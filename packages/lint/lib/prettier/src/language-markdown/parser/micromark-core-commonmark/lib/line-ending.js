/**
 * @import {
 *   Construct,
 *   State,
 *   TokenizeContext,
 *   Tokenizer
 * } from '../node_modules/micromark-util-types/index.js'
 */

import { factorySpace } from '../../micromark-factory-space/index.js';

/** @type {Construct} */
export const lineEnding = {
  name: 'lineEnding',
  tokenize: tokenizeLineEnding,
};

/**
 * @this {TokenizeContext}
 *   Context.
 * @type {Tokenizer}
 */
function tokenizeLineEnding(effects, ok) {
  return start;

  /** @type {State} */
  function start(code) {
    effects.enter('lineEnding');
    effects.consume(code);
    effects.exit('lineEnding');
    return factorySpace(effects, ok, 'linePrefix');
  }
}
