// Ported from parse5's packages/parse5/lib/tokenizer/index.test.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { fileURLToPath } from 'node:url';
import { it, describe } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import { Tokenizer } from '../../../index.js';
import { generateTokenizationTests } from '../utils/generate-tokenization-tests.js';
const dataPath = new URL('../data/html5lib-tests/tokenizer', import.meta.url);
const tokenizerOpts = {
    sourceCodeLocationInfo: true,
};
generateTokenizationTests('Tokenizer', fileURLToPath(dataPath), (handler) => new Tokenizer(tokenizerOpts, handler));
function noop() {
    // Noop
}
describe('Tokenizer methods', () => {
    it('should pause and resume', () => {
        let count = 0;
        const tokenizer = new Tokenizer(tokenizerOpts, {
            onComment(t) {
                assert.strictEqual(t.data, 'INIT');
                assert.strictEqual(count++, 0);
                tokenizer.pause();
                tokenizer.write('<!doctype foo>', false);
            },
            onDoctype(t) {
                assert.strictEqual(t.name, 'foo');
                assert.strictEqual(count++, 2);
                assert.throws(() => tokenizer.resume(), 'Parser was already resumed');
                tokenizer.write('<next>', true);
            },
            onStartTag(t) {
                assert.strictEqual(count++, 3);
                assert.strictEqual(t.tagName, 'next');
            },
            onEndTag: noop,
            onEof: noop,
            onCharacter: noop,
            onNullCharacter: noop,
            onWhitespaceCharacter: noop,
        });
        tokenizer.write('<!--INIT-->', false);
        assert.strictEqual(count++, 1);
        assert.ok(Object.prototype.hasOwnProperty.call(tokenizer, 'paused'));
        assert.equal(tokenizer.paused, true);
        tokenizer.resume();
        assert.strictEqual(count, 4);
    });
    it('should throw if setting the state to an unknown value', () => {
        const tokenizer = new Tokenizer(tokenizerOpts, {});
        tokenizer.state = -1;
        assert.throws(() => tokenizer.write('foo', true), 'Unknown state');
    });
});
