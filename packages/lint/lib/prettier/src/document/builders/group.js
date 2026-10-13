import { DOC_TYPE_GROUP } from './types.js';

/**
@import {Doc} from "./index.js";
@typedef {symbol} GroupId
@typedef {{
  readonly type: DOC_TYPE_GROUP,
  readonly id: GroupId,
  readonly contents: Doc,
  readonly break: boolean,
  readonly expandedStates: readonly Doc[],
}} Group
@typedef {{id?: GroupId, shouldBreak?: boolean, expandedStates?: Doc[]}} GroupOptions
*/

/**
@param {Doc} contents
@param {GroupOptions} [options]
@returns {Group}
*/
function group(contents, options = {}) {
  return {
    type: DOC_TYPE_GROUP,
    id: options.id,
    contents,
    break: Boolean(options.shouldBreak),
    expandedStates: options.expandedStates,
    // @xufa/lint: the run of propagateBreaks() that last went through it (there from the start: one shape for all).
    propagated: 0,
  };
}

/**
@param {Doc[]} states
@param {Omit<GroupOptions, "expandedStates">} [options]
@returns Doc
*/
function conditionalGroup(states, options) {
  return group(states[0], { ...options, expandedStates: states });
}

export { conditionalGroup, group };
