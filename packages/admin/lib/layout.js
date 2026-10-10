// Where the graph of a run draws its steps: in columns by depth (a step after those it follows), and in each column in
// the order that crosses the fewest arrows. A step after one two or more columns back gets a placeholder in each
// column between, so the long arrow counts as the others do. The order: sweeps from left to right (each step by the
// mean place of the steps before it) and back (by the steps after it), the best of them kept; then each column is
// centered on the tallest one. A long arrow passes through the places of its placeholders (its points), not over steps.
//
//   layout([{ id: 'a', after: [] }, { id: 'b', after: ['a'] }])
//   // { at: { a: { column: 0, row: 0 }, b: { column: 1, row: 0 } }, edges: [{ from: 'a', to: 'b', points: [] }], ... }

const SWEEPS = 12;

function layout(steps) {
  const ids = new Set(steps.map((step) => step.id));
  const depth = {};
  for (const step of steps) {
    let at = 0;
    for (const parent of step.after) if (depth[parent] !== undefined) at = Math.max(at, depth[parent] + 1);
    depth[step.id] = at;
  }
  // The columns, with placeholders ({ id, dummy }) where an arrow passes a column.
  const columns = [];
  const add = (column, id) => (columns[column] = columns[column] || []).push(id);
  for (const step of steps) add(depth[step.id], step.id);
  // Each arrow as links between neighbor columns: [from, to].
  const links = [];
  let dummies = 0;
  const edges = [];
  for (const step of steps) {
    for (const parent of step.after) {
      if (!ids.has(parent) || depth[parent] === undefined) continue;
      let from = parent;
      const chain = [];
      for (let column = depth[parent] + 1; column < depth[step.id]; column += 1) {
        dummies += 1;
        const id = `\u0000${dummies}`;
        add(column, id);
        chain.push(id);
        links.push([from, id]);
        from = id;
      }
      links.push([from, step.id]);
      edges.push({ from: parent, to: step.id, chain });
    }
  }
  const before = new Map();
  const after = new Map();
  for (const [from, to] of links) {
    if (!before.has(to)) before.set(to, []);
    if (!after.has(from)) after.set(from, []);
    before.get(to).push(from);
    after.get(from).push(to);
  }

  const placeOf = (order) => {
    const place = new Map();
    for (const column of order) column.forEach((id, index) => place.set(id, index));
    return place;
  };
  const crossings = (order) => {
    const place = placeOf(order);
    let count = 0;
    for (let column = 0; column + 1 < order.length; column += 1) {
      const between = links
        .filter(([from]) => order[column].includes(from))
        .map(([from, to]) => [place.get(from), place.get(to)]);
      for (let i = 0; i < between.length; i += 1) {
        for (let j = i + 1; j < between.length; j += 1) {
          const [a1, b1] = between[i];
          const [a2, b2] = between[j];
          if ((a1 - a2) * (b1 - b2) < 0) count += 1;
        }
      }
    }
    return count;
  };
  // A column ordered by the mean place of its neighbors (in the column next to it); those without keep their place.
  const reorder = (column, neighbors, place) => {
    const keyed = column.map((id, index) => {
      const near = (neighbors.get(id) || []).map((other) => place.get(other)).filter((value) => value !== undefined);
      return { id, index, key: near.length ? near.reduce((sum, value) => sum + value, 0) / near.length : index };
    });
    keyed.sort((a, b) => a.key - b.key || a.index - b.index);
    return keyed.map((item) => item.id);
  };

  let order = columns.map((column) => [...(column || [])]);
  let best = order.map((column) => [...column]);
  let fewest = crossings(order);
  for (let sweep = 0; sweep < SWEEPS && fewest > 0; sweep += 1) {
    const down = sweep % 2 === 0;
    const range = down ? [...order.keys()].slice(1) : [...order.keys()].reverse().slice(1);
    for (const column of range) {
      const place = placeOf(order);
      order[column] = reorder(order[column], down ? before : after, place);
    }
    const count = crossings(order);
    if (count < fewest) {
      fewest = count;
      best = order.map((list) => [...list]);
    }
  }
  order = best;

  const rows = Math.max(0, ...order.map((column) => column.length));
  const place = {};
  order.forEach((column, index) => {
    const offset = (rows - column.length) / 2;
    column.forEach((id, row) => {
      place[id] = { column: index, row: row + offset };
    });
  });
  const at = Object.fromEntries([...ids].map((id) => [id, place[id]]));
  return {
    at,
    edges: edges.map(({ from, to, chain }) => ({ from, to, points: chain.map((id) => place[id]) })),
    columns: order.length,
    rows,
    crossings: fewest,
  };
}

export { layout };
