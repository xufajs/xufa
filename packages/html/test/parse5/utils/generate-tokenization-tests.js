// Ported from parse5's test/utils/generate-tokenization-tests.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { it } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import * as fs from 'node:fs';
import path from 'node:path';
import { TokenizerMode } from '../../../index.js';
import { makeChunks } from './common.js';
/** Receives events and immediately compares them against the expected values. We check the entire output again at the end. */
class TokenizeHandler {
    testData;
    constructor(testData) {
        this.testData = testData;
    }
    addToken(token) {
        assert.deepStrictEqual(token, this.testData.expected[this.tokens.length]);
        this.tokens.push(token);
    }
    onComment(token) {
        this.addToken(['Comment', token.data]);
    }
    onDoctype(token) {
        this.addToken(['DOCTYPE', token.name, token.publicId, token.systemId, !token.forceQuirks]);
    }
    onStartTag(token) {
        const reformatedAttrs = Object.fromEntries(token.attrs.map(({ name, value }) => [name, value]));
        const startTagEntry = ['StartTag', token.tagName, reformatedAttrs];
        if (token.selfClosing) {
            startTagEntry.push(true);
        }
        this.addToken(startTagEntry);
    }
    onEndTag(token) {
        // NOTE: parser feedback simulator can produce adjusted SVG
        // tag names for end tag tokens so we need to lower case it
        this.addToken(['EndTag', token.tagName.toLowerCase()]);
    }
    onEof() {
        this.sawEof = true;
    }
    onCharacter(token) {
        const lastEntry = this.tokens[this.tokens.length - 1];
        if (lastEntry && lastEntry[0] === 'Character' && lastEntry[1] != null) {
            lastEntry[1] += token.chars;
        }
        else {
            this.tokens.push(['Character', token.chars]);
        }
        const actual = this.tokens[this.tokens.length - 1];
        const expected = this.testData.expected[this.tokens.length - 1];
        assert.strictEqual('Character', expected[0]);
        assert.ok(typeof actual[1] === 'string');
        assert.ok(expected[1]?.startsWith(actual[1]));
    }
    onNullCharacter(token) {
        this.onCharacter(token);
    }
    onWhitespaceCharacter(token) {
        this.onCharacter(token);
    }
    onParseError(err) {
        assert.ok(this.testData.expectedErrors.some(({ code, line, col }) => code === err.code && line === err.startLine && col === err.startCol));
        this.errors.push({
            code: err.code,
            line: err.startLine,
            col: err.startCol,
        });
    }
    sawEof = false;
    tokens = [];
    errors = [];
}
function tokenize(createTokenSource, chunks, testData) {
    const result = new TokenizeHandler(testData);
    const tokenizer = createTokenSource(result);
    // NOTE: set small waterline for testing purposes
    tokenizer.preprocessor.bufferWaterline = 8;
    tokenizer.state = testData.initialState;
    if (testData.lastStartTag) {
        tokenizer.lastStartTagName = testData.lastStartTag;
    }
    for (let i = 0; i < chunks.length; i++) {
        assert.ok(!result.sawEof);
        tokenizer.write(chunks[i], i === chunks.length - 1);
    }
    assert.ok(result.sawEof);
    assert.ok(!tokenizer.active);
    // Sort errors by line and column
    result.errors.sort((err1, err2) => err1.line - err2.line || err1.col - err2.col);
    return result;
}
function unicodeUnescape(str) {
    return str.replace(/\\[Uu]\w{4}/g, (match) => String.fromCharCode(Number.parseInt(match.slice(2), 16)));
}
function unescapeDescrIO(testDescr) {
    testDescr.input = unicodeUnescape(testDescr.input);
    for (const tokenEntry of testDescr.output) {
        //NOTE: unescape token tagName (for StartTag and EndTag tokens), comment data (for Comment token),
        //character token data (for Character token).
        if (tokenEntry[1]) {
            tokenEntry[1] = unicodeUnescape(tokenEntry[1]);
        }
    }
}
function getTokenizerSuitableStateName(testDataStateName) {
    const name = testDataStateName.slice(0, -6).replace(' ', '_').toUpperCase();
    return TokenizerMode[name];
}
function loadTests(dataDirPath) {
    const testSetFileNames = fs.readdirSync(dataDirPath);
    const tests = [];
    let testIdx = 0;
    for (const fileName of testSetFileNames) {
        if (path.extname(fileName) !== '.test') {
            continue;
        }
        const filePath = path.join(dataDirPath, fileName);
        const testSetJson = fs.readFileSync(filePath).toString();
        const testSet = JSON.parse(testSetJson);
        const testDescrs = testSet.tests;
        if (!testDescrs) {
            continue;
        }
        const setName = fileName.replace('.test', '');
        for (const descr of testDescrs) {
            if (!descr.initialStates) {
                descr.initialStates = ['Data state'];
            }
            if (descr.doubleEscaped) {
                unescapeDescrIO(descr);
            }
            const expected = descr.output;
            for (const initialStateName of descr.initialStates) {
                tests.push({
                    idx: ++testIdx,
                    setName,
                    name: descr.description,
                    input: descr.input,
                    expected,
                    initialState: getTokenizerSuitableStateName(initialStateName),
                    initialStateName,
                    lastStartTag: descr.lastStartTag,
                    expectedErrors: descr.errors || [],
                });
            }
        }
    }
    return tests;
}
export function generateTokenizationTests(prefix, testSuite, createTokenSource) {
    for (const testData of loadTests(testSuite)) {
        const testName = `${prefix} - ${testData.idx}.${testData.setName} - ${testData.name} - Initial state: ${testData.initialStateName}`;
        it(testName, () => {
            const chunks = makeChunks(testData.input);
            const result = tokenize(createTokenSource, chunks, testData);
            assert.deepEqual(result.tokens, testData.expected, `Chunks: ${JSON.stringify(chunks)}`);
            assert.deepEqual(result.errors, testData.expectedErrors || []);
        });
    }
}
