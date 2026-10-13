import { DOC_TYPE_ARRAY, DOC_TYPE_STRING } from '../builders/types.js';

/**
@import {Doc} from "../builders/index.js";
*/

/**
@template {unknown} InputDoc
@param {InputDoc} doc
@returns {
  InputDoc extends string ? DOC_TYPE_STRING
  : InputDoc extends readonly Doc[] ? DOC_TYPE_ARRAY
  : InputDoc extends Doc ? InputDoc["type"]
  : void
}
*/
function getDocType(doc) {
  if (typeof doc === 'string') {
    // @ts-expect-error -- TS throws [TS2322], but actually works
    return DOC_TYPE_STRING;
  }

  if (Array.isArray(doc)) {
    // @ts-expect-error -- TS throws [TS2322], but actually works
    return DOC_TYPE_ARRAY;
  }

  if (!doc) {
    return;
  }

  // (Docs are made by the builders: their type is valid. Checking it in a set took a tenth of fits().)
  // @ts-expect-error -- Safe
  return doc.type;
}

export default getDocType;
