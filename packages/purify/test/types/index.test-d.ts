import { expectTypeOf } from '@xufa/test';
import DOMPurify from '@xufa/purify';
import type { Config } from '@xufa/purify';
import { createWindow } from '@xufa/html/dom';

expectTypeOf(DOMPurify.sanitize('<b>x</b>')).toEqualTypeOf<string>();
const config: Config = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true };
expectTypeOf(DOMPurify.sanitize('<b>x</b>', config)).toEqualTypeOf<string>();
expectTypeOf(DOMPurify.sanitize('<b>x</b>', { RETURN_DOM_FRAGMENT: true })).toEqualTypeOf<DocumentFragment>();
expectTypeOf(DOMPurify.version).toEqualTypeOf<string>();
const other = DOMPurify(createWindow());
expectTypeOf(other.isSupported).toEqualTypeOf<boolean>();
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  expectTypeOf(data.attrName).toEqualTypeOf<string>();
});
// @ts-expect-error: ALLOWED_TAGS is a list
DOMPurify.sanitize('x', { ALLOWED_TAGS: 'b' });
