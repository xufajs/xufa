// Ported from parse5's test/utils/common.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { describe } from '@xufa/test';
import { assert } from '../../support/chai-assert.js';
import { Writable, finished as finishedCb } from 'node:stream';
import { defaultTreeAdapter } from '../../../index.js';
// Ensure the default tree adapter matches the expected type.
export const treeAdapters = {
    default: defaultTreeAdapter,
};
export function addSlashes(str) {
    return str
        .replace(/\t/g, String.raw `\t`)
        .replace(/\n/g, String.raw `\n`)
        .replace(/\f/g, String.raw `\f`)
        .replace(/\r/g, String.raw `\r`)
        .replace(/\0/g, String.raw `\u0000`);
}
function createDiffMarker(markerPosition) {
    return '^\n'.padStart(markerPosition + 1, ' ');
}
function getRandomChunkSize(min = 1, max = 10) {
    return min + Math.floor(Math.random() * (max - min + 1));
}
export function makeChunks(str, minSize, maxSize) {
    if (str.length === 0) {
        return [''];
    }
    const chunks = [];
    let start = 0;
    // NOTE: start with 1, so we avoid situation when we have just one huge chunk
    let end = 1;
    while (start < str.length) {
        chunks.push(str.substring(start, end));
        start = end;
        end = Math.min(end + getRandomChunkSize(minSize, maxSize), str.length);
    }
    return chunks;
}
export class WritableStreamStub extends Writable {
    writtenData = '';
    constructor() {
        super({ decodeStrings: false });
    }
    _write(chunk, _encoding, callback) {
        assert.strictEqual(typeof chunk, 'string', 'Expected output to be a string stream');
        this.writtenData += chunk;
        callback();
    }
}
export function normalizeNewLine(str) {
    return str.replace(/\r\n/g, '\n');
}
export function removeNewLines(str) {
    return str.replace(/[\n\r]/g, '');
}
export function writeChunkedToStream(str, stream) {
    const chunks = makeChunks(str);
    const lastChunkIdx = chunks.length - 1;
    for (const [idx, chunk] of chunks.entries()) {
        if (idx === lastChunkIdx) {
            stream.end(chunk);
        }
        else {
            stream.write(chunk);
        }
    }
}
export function generateTestsForEachTreeAdapter(name, ctor) {
    describe(name, () => {
        for (const adapterName of Object.keys(treeAdapters)) {
            const adapter = treeAdapters[adapterName];
            describe(`Tree adapter: ${adapterName}`, () => {
                ctor(adapter);
            });
        }
    });
}
export function getStringDiffMsg(actual, expected) {
    for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            let diffMsg = `\nString differ at index ${i}\n`;
            const expectedStr = `Expected: ${addSlashes(expected.substring(i - 100, i + 1))}`;
            const expectedDiffMarker = createDiffMarker(expectedStr.length);
            diffMsg += `${expectedStr}${addSlashes(expected.substring(i + 1, i + 20))}\n${expectedDiffMarker}`;
            const actualStr = `Actual:   ${addSlashes(actual.substring(i - 100, i + 1))}`;
            const actualDiffMarker = createDiffMarker(actualStr.length);
            diffMsg += `${actualStr}${addSlashes(actual.substring(i + 1, i + 20))}\n${actualDiffMarker}`;
            return diffMsg;
        }
    }
    return '';
}
export function getSubstringByLineCol(lines, loc) {
    lines = lines.slice(loc.startLine - 1, loc.endLine);
    const last = lines.length - 1;
    lines[last] = lines[last].substring(0, loc.endCol - 1);
    lines[0] = lines[0].substring(loc.startCol - 1);
    return lines.join('\n');
}
// TODO [engine:node@>=16]: Replace this with `finished` from 'node:stream/promises'.
export function finished(stream) {
    return new Promise((resolve, reject) => finishedCb(stream, (err) => (err ? reject(err) : resolve())));
}
