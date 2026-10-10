import { layout } from '../lib/layout.js';

// The arrows that cross, as drawn: between neighbor columns, through the points of long arrows.
function crossingsOf(steps, drawn) {
  const segments = [];
  for (const edge of drawn.edges) {
    const path = [drawn.at[edge.from], ...edge.points, drawn.at[edge.to]];
    for (let i = 0; i + 1 < path.length; i += 1) segments.push([path[i], path[i + 1]]);
  }
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const [a1, b1] = segments[i];
      const [a2, b2] = segments[j];
      if (a1.column === a2.column && (a1.row - a2.row) * (b1.row - b2.row) < 0) count += 1;
    }
  }
  return count;
}

const step = (id, ...after) => ({ id, after });

describe('the layout of the graph of a run', () => {
  it('columns by depth; a chain in one row; an empty graph', () => {
    const drawn = layout([step('a'), step('b', 'a'), step('c', 'b')]);
    expect(drawn.at).toEqual({ a: { column: 0, row: 0 }, b: { column: 1, row: 0 }, c: { column: 2, row: 0 } });
    expect([drawn.columns, drawn.rows, drawn.crossings]).toEqual([3, 1, 0]);
    expect(layout([])).toMatchObject({ at: {}, edges: [], columns: 0, rows: 0 });
  });

  it('orders the columns so that arrows do not cross when they need not', () => {
    // Declared in the order that crosses: a -> d, b -> c, with c above d.
    const steps = [step('a'), step('b'), step('c', 'b'), step('d', 'a'), step('e', 'c'), step('f', 'd')];
    const drawn = layout(steps);
    expect(drawn.crossings).toBe(0);
    expect(crossingsOf(steps, drawn)).toBe(0);
    expect(drawn.at.d.row < drawn.at.c.row).toBe(drawn.at.a.row < drawn.at.b.row);
  });

  it('long arrows pass through places of their own (points), between the steps of other columns', () => {
    const steps = [step('fetch'), step('parse', 'fetch'), step('check', 'parse'), step('save', 'check', 'fetch')];
    const drawn = layout(steps);
    const long = drawn.edges.find((edge) => edge.from === 'fetch' && edge.to === 'save');
    expect(long.points.map((point) => point.column)).toEqual([1, 2]);
    // Its points are not where steps are.
    const taken = new Set(Object.values(drawn.at).map((place) => `${place.column}:${place.row}`));
    for (const point of long.points) expect(taken.has(`${point.column}:${point.row}`)).toBe(false);
    expect(crossingsOf(steps, drawn)).toBe(0);
  });

  it('a wide graph declared in a crossing order: none crossed, and each column centered', () => {
    const steps = [
      step('a'),
      step('b'),
      step('c'),
      step('x', 'c'),
      step('y', 'b'),
      step('z', 'a'),
      step('p', 'z'),
      step('q', 'x'),
      step('r', 'y', 'q'),
    ];
    const drawn = layout(steps);
    expect(crossingsOf(steps, drawn)).toBe(drawn.crossings);
    expect(drawn.crossings).toBe(0);
    // A column with fewer places than the tallest is centered.
    const rowsOf = (column) => Object.values(drawn.at).filter((place) => place.column === column).map((place) => place.row);
    expect(Math.min(...rowsOf(0))).toBe(0);
    expect(rowsOf(3)).toEqual([(drawn.rows - 1) / 2]);
  });

  it('steps after steps that are not there are drawn as roots', () => {
    const drawn = layout([step('a', 'gone'), step('b', 'a')]);
    expect(drawn.at).toEqual({ a: { column: 0, row: 0 }, b: { column: 1, row: 0 } });
    expect(drawn.edges).toEqual([{ from: 'a', to: 'b', points: [] }]);
  });
});
