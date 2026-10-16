// Ported from parse5's packages/parse5/lib/tokenizer/tokenizer-location-info.test.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { it } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import { Tokenizer, TokenizerMode } from '../../../lib/parse5/tokenizer/index.js';
import { getSubstringByLineCol, normalizeNewLine } from '../utils/common.js';
/** Receives events and immediately compares them against the expected values. */
class LocationInfoHandler {
    htmlChunks;
    sawEof = false;
    /** All HTML chunks concatenated. */
    html;
    /** The index of the last html chunk. */
    idx = 0;
    /** All of the lines in the input. */
    lines;
    constructor(htmlChunks) {
        this.htmlChunks = htmlChunks;
        this.html = htmlChunks.join('');
        this.lines = this.html.split(/\r?\n/g);
    }
    validateLocation(location) {
        assert.ok(location);
        //Offsets
        const actual = this.html.substring(location.startOffset, location.endOffset);
        const chunk = this.htmlChunks[this.idx];
        assert.strictEqual(actual, chunk);
        //Line/col
        const line = getSubstringByLineCol(this.lines, location);
        const expected = normalizeNewLine(chunk);
        assert.strictEqual(line, expected);
        this.idx += 1;
    }
    onComment({ location }) {
        this.validateLocation(location);
    }
    onDoctype({ location }) {
        this.validateLocation(location);
    }
    onStartTag({ location }) {
        this.validateLocation(location);
    }
    onEndTag({ location }) {
        this.validateLocation(location);
    }
    onCharacter({ location }) {
        this.validateLocation(location);
    }
    onNullCharacter({ location }) {
        this.validateLocation(location);
    }
    onWhitespaceCharacter({ location }) {
        this.validateLocation(location);
    }
    onEof({ location }) {
        assert.ok(location);
        assert.strictEqual(location.endOffset, location.startOffset);
        assert.strictEqual(location.endOffset, this.html.length);
        assert.strictEqual(this.idx, this.htmlChunks.length);
        this.sawEof = true;
    }
}
it('Location Info (Tokenizer)', () => {
    const testCases = [
        {
            initialMode: TokenizerMode.DATA,
            lastStartTagName: '',
            htmlChunks: [
                '\r\n',
                '<!DOCTYPE html>',
                '\n',
                '<!-- Test -->',
                '\n',
                '<head>',
                '\n   ',
                '<meta charset="utf-8">',
                '<title>',
                '   ',
                'node.js',
                '\u0000',
                '</title>',
                '\n',
                '</head>',
                '\n',
                '<body id="front">',
                '\n',
                '<div id="intro">',
                '\n   ',
                '<p\n>',
                '\n       ',
                'Node.js',
                ' ',
                'is',
                ' ',
                'a',
                '\n       ',
                'platform',
                ' ',
                'built',
                ' ',
                'on',
                '\n       ',
                '<a href="http://code.google.com/p/v8/">',
                '\n       ',
                "Chrome's",
                ' ',
                'JavaScript',
                ' ',
                'runtime',
                '\n       ',
                '</a>',
                '\n',
                '</div>',
                '</body>',
            ],
        },
        {
            initialMode: TokenizerMode.RCDATA,
            lastStartTagName: 'title',
            htmlChunks: ['<div>Test', ' \n   ', 'hey', ' ', 'ya!', '</title>', '<!--Yo-->'],
        },
        {
            initialMode: TokenizerMode.RAWTEXT,
            lastStartTagName: 'style',
            htmlChunks: ['.header{', ' \n   ', 'color:red;', '\n', '}', '</style>', 'Some', ' ', 'text'],
        },
        {
            initialMode: TokenizerMode.SCRIPT_DATA,
            lastStartTagName: 'script',
            htmlChunks: ['var', ' ', 'a=c', ' ', '-', ' ', 'd;', '\n', 'a<--d;', '</script>', '<div>'],
        },
        {
            initialMode: TokenizerMode.PLAINTEXT,
            lastStartTagName: 'plaintext',
            htmlChunks: ['Text', ' \n', 'Test</plaintext><div>'],
        },
        {
            initialMode: TokenizerMode.DATA,
            lastStartTagName: '',
            htmlChunks: [
                '\n',
                '<!-- regular comment -->',
                '<! bogus comment >',
                '<? another bogus comment >',
                '</!yet another bogus comment>',
                '<![CDATA[ cdata as a bogus comment >',
            ],
        },
        {
            initialMode: TokenizerMode.DATA,
            lastStartTagName: '',
            inForeignNode: true,
            htmlChunks: ['<a>', '<![CDATA[ ', 'CDATA', ' ]]>', '<test>', ' <![CDATA[ ]]>\n'],
        },
    ];
    for (const testCase of testCases) {
        const { htmlChunks } = testCase;
        const handler = new LocationInfoHandler(htmlChunks);
        const tokenizer = new Tokenizer({ sourceCodeLocationInfo: true }, handler);
        // NOTE: set small waterline for testing purposes
        tokenizer.preprocessor.bufferWaterline = 8;
        tokenizer.state = testCase.initialMode;
        tokenizer.lastStartTagName = testCase.lastStartTagName;
        tokenizer.inForeignNode = !!testCase.inForeignNode;
        for (let i = 0; i < htmlChunks.length; i++) {
            tokenizer.write(htmlChunks[i], i === htmlChunks.length - 1);
        }
        assert.ok(handler.sawEof);
        assert.ok(!tokenizer.active);
    }
});
