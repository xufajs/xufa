import { expectTypeOf } from '@xufa/test';
import { parse, parseFragment, serialize, serializeOuter, defaultTreeAdapter } from '@xufa/html';
import type { DefaultTreeAdapterMap } from '@xufa/html';

type Element = DefaultTreeAdapterMap['element'];
const document = parse('<!doctype html><p class="a">Hi', { sourceCodeLocationInfo: true });
expectTypeOf(serialize(document)).toEqualTypeOf<string>();
const fragment = parseFragment('<b>x</b>');
const b = fragment.childNodes[0] as Element;
expectTypeOf(b.tagName).toEqualTypeOf<string>();
expectTypeOf(b.attrs).toEqualTypeOf<DefaultTreeAdapterMap['element']['attrs']>();
expectTypeOf(serializeOuter(b)).toEqualTypeOf<string>();
expectTypeOf(defaultTreeAdapter.isElementNode(b)).toEqualTypeOf<boolean>();
// @ts-expect-error: parse takes text
parse(3);

// The DOM.
import { createWindow, DOMParser as XufaDOMParser } from '@xufa/html/dom';
const window = createWindow('<p>x</p>');
expectTypeOf(window.document.body.innerHTML).toEqualTypeOf<string>();
expectTypeOf(new XufaDOMParser().parseFromString('<b>', 'text/html')).toEqualTypeOf<Document>();
expectTypeOf(window.document.createNodeIterator(window.document.body, window.NodeFilter.SHOW_ELEMENT).nextNode()).toEqualTypeOf<Node | null>();
