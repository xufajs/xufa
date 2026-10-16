// Ported from the declarations tsc makes of parse5/packages/parse5/lib/common/foreign-content.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { TAG_ID as $, NS } from './html.js';
import type { TagToken, Attribute } from './token.js';
export declare const SVG_TAG_NAMES_ADJUSTMENT_MAP: Map<string, string>;
export declare function causesExit(startTagToken: TagToken): boolean;
export declare function adjustTokenMathMLAttrs(token: TagToken): void;
export declare function adjustTokenSVGAttrs(token: TagToken): void;
export declare function adjustTokenXMLAttrs(token: TagToken): void;
export declare function adjustTokenSVGTagName(token: TagToken): void;
export declare function isIntegrationPoint(tn: $, ns: NS, attrs: Attribute[], foreignNS?: NS): boolean;
