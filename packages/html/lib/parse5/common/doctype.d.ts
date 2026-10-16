// Ported from the declarations tsc makes of parse5/packages/parse5/lib/common/doctype.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { DOCUMENT_MODE } from './html.js';
import type { DoctypeToken } from './token.js';
export declare function isConforming(token: DoctypeToken): boolean;
export declare function getDocumentMode(token: DoctypeToken): DOCUMENT_MODE;
