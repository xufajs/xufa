// A hybrid logical clock: versions [milliseconds, counter, node id] that follow the time of the machines, and still
// order every write after those it has seen (a node that receives a version moves its clock past it). Two writes of
// one key on two nodes are ordered the same way on every node: the higher version wins everywhere.
class Clock {
  constructor(node) {
    this.node = node;
    this.wall = 0;
    this.counter = 0;
  }

  now() {
    const time = Date.now();
    if (time > this.wall) {
      this.wall = time;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return [this.wall, this.counter, this.node];
  }

  // A version received: the next ones of this node come after it.
  see([wall, counter]) {
    const time = Date.now();
    const next = Math.max(time, this.wall, wall);
    if (next === this.wall && next === wall) this.counter = Math.max(this.counter, counter) + 1;
    else if (next === this.wall) this.counter += 1;
    else if (next === wall) this.counter = counter + 1;
    else this.counter = 0;
    this.wall = next;
  }
}

// -1, 0 or 1: the order of two versions (null is before every version).
function compare(a, b) {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  if (a[2] === b[2]) return 0;
  return a[2] < b[2] ? -1 : 1;
}

module.exports = { Clock, compare };
