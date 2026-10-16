// Ported from parse5's test/utils/parse-dat-file.ts by tools/port-parse5/port.js: do not edit, change the tool.
import { html } from '../../../index.js';
function createFragmentContext(tagName, treeAdapter) {
    if (!tagName) {
        return null;
    }
    let namespace = html.NS.HTML;
    const parts = tagName.split(' ');
    if (parts.length > 1) {
        tagName = parts[1];
        if (parts[0] === 'svg') {
            namespace = html.NS.SVG;
        }
        else if (parts[0] === 'math') {
            namespace = html.NS.MATHML;
        }
    }
    return treeAdapter.createElement(tagName, namespace, []);
}
export function parseDatFile(testSet, treeAdapter) {
    const testDescrs = [];
    let curDirective = '';
    let curDescr = {};
    for (const [idx, line] of testSet.split(/\r?\n/).entries()) {
        if (line === '#data') {
            curDescr = { '#line': idx + 1 };
            testDescrs.push(curDescr);
        }
        if (line[0] === '#') {
            curDirective = line;
            curDescr[curDirective] = [];
        }
        else {
            curDescr[curDirective].push(line);
        }
    }
    return testDescrs.map((descr) => {
        const fragmentContextTagName = descr['#document-fragment']?.[0];
        return {
            input: descr['#data'].join('\n'),
            expected: descr['#document'].join('\n'),
            expectedErrors: descr['#new-errors'] || [],
            disableEntitiesDecoding: !!descr['#disable-html-entities-decoding'],
            lineNum: descr['#line'],
            scriptingEnabled: !descr['#script-off'],
            fragmentContext: createFragmentContext(fragmentContextTagName, treeAdapter),
        };
    });
}
