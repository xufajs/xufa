// @xufa/purify: DOMPurify (ported by tools/port-purify: lib/) on the DOM of @xufa/html, ready in Node, where it needed
// jsdom: DOMPurify.sanitize(dirty, config) as DOMPurify has it, and DOMPurify(window) for another window.
import purify from './lib/purify.js';
import { createWindow } from '@xufa/html/dom';

const DOMPurify = purify(createWindow());

export default DOMPurify;
export { DOMPurify as 'module.exports' };
