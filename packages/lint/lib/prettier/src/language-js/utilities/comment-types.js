import { createTypeCheckFunction } from './create-type-check-function.js';

/**
@import {Comment} from "../types/estree.js";
*/

/**
 * @param {Comment} comment
 * @returns {boolean}
 */
const isBlockComment = createTypeCheckFunction(['Block', 'CommentBlock']);

const isLineComment = createTypeCheckFunction(['Line', 'CommentLine']);

export { isBlockComment, isLineComment };
