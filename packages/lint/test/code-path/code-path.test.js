import { CodePathAnalyzer } from '../../lib/code-path/analyzer.js';
import { traverse } from '../../lib/ast/traverse.js';
import { parse } from '../../lib/parser.js';

// The events of the analysis of a text: `name id` (and the code paths when they end).
function analyze(text) {
  const events = [];
  const codePaths = [];
  const analyzer = new CodePathAnalyzer({
    enterNode() {},
    leaveNode() {},
    emit(name, [first, second]) {
      events.push(name === 'onCodePathSegmentLoop' ? `${name} ${first.id}->${second.id}` : `${name} ${first.id}`);
      if (name === 'onCodePathEnd') codePaths.push(first);
    },
  });
  traverse(parse(text, { sourceType: 'module', jsx: false }), {
    enter(node, parent) {
      node.parent = parent;
      analyzer.enterNode(node);
    },
    leave: (node) => analyzer.leaveNode(node),
  });
  return { events, codePaths };
}

describe('code paths', () => {
  it('a code path for the program and each function, nested', () => {
    const { codePaths } = analyze('function f() { return () => 1; }');
    expect(codePaths.map((codePath) => [codePath.id, codePath.origin, codePath.upper?.id ?? null])).toEqual([
      ['s3', 'function', 's2'],
      ['s2', 'function', 's1'],
      ['s1', 'program', null],
    ]);
    expect(codePaths[2].childCodePaths.map((child) => child.id)).toEqual(['s2']);
  });

  it('what follows a return is unreachable', () => {
    const { events } = analyze('function f() { return; a(); }');
    expect(events).toContain('onUnreachableCodePathSegmentStart s2_2');
  });

  it('an if forks and joins', () => {
    const { codePaths } = analyze('if (a) b(); else c(); d();');
    const [program] = codePaths;
    const segments = [];
    program.traverseSegments((segment) => segments.push(`${segment.id}:${segment.nextSegments.map((next) => next.id).join(',')}`));
    expect(segments).toEqual(['s1_1:s1_2,s1_3', 's1_2:s1_4', 's1_3:s1_4', 's1_4:']);
  });

  it('a loop links back, and says so', () => {
    const { events, codePaths } = analyze('while (a) { b(); }');
    expect(events.filter((event) => event.startsWith('onCodePathSegmentLoop'))).toEqual(['onCodePathSegmentLoop s1_3->s1_2']);
    const test = codePaths[0].initialSegment.nextSegments[0];
    expect(test.prevSegments.map((segment) => segment.id)).toEqual(['s1_1', 's1_3']);
  });

  it('returned and thrown segments', () => {
    const { codePaths } = analyze('function f() { if (a) throw b; return c; }');
    const [fn] = codePaths;
    expect(fn.thrownSegments.map((segment) => segment.id)).toEqual(['s2_2']);
    expect(fn.returnedSegments.map((segment) => segment.id)).toEqual(['s2_4']);
    expect(fn.finalSegments.map((segment) => segment.id)).toEqual(['s2_2', 's2_4']);
  });
});
